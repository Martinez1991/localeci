/**
 * LocaleCI GitHub Action (spec §7). A thin wrapper over the CLI's programmatic
 * API: on a PR it translates changed strings, commits them back to the branch,
 * and upserts a single quality-report comment. Fork PRs run read-only (`check`)
 * because they have no access to secrets.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import * as core from "@actions/core";
import { LockStore } from "@localeci/core";
import { createProviderFromConfig } from "@localeci/providers";
import {
  loadConfig,
  loadGlossary,
  loadLock,
  saveLock,
  translateProject,
  checkProject,
} from "localeci";
import { buildTranslateComment, buildCheckComment, COMMENT_MARKER } from "./report.js";
import { upsertComment, type GitHubContext } from "./github.js";
import { commitAndPush } from "./git.js";

interface PrEvent {
  pull_request?: {
    number: number;
    head: { ref: string; repo?: { fork?: boolean; full_name?: string } };
    base: { repo?: { full_name?: string } };
  };
}

function readEvent(): PrEvent | null {
  const p = process.env.GITHUB_EVENT_PATH;
  if (!p || !existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as PrEvent;
  } catch {
    return null;
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function run(): Promise<void> {
  const cwd = resolve(process.cwd(), core.getInput("config") || ".");
  const apiKey = core.getInput("api-key");
  const providerOverride = core.getInput("provider");
  const localesInput = core.getInput("locales");
  const doCommit = (core.getInput("commit") || "true") !== "false";
  const doComment = (core.getInput("comment") || "true") !== "false";
  const token = core.getInput("github-token");

  const env: Record<string, string | undefined> = { ...process.env };
  if (apiKey) env.LOCALECI_KEY = apiKey;

  const { config } = loadConfig(cwd);
  if (providerOverride) config.provider.name = providerOverride as typeof config.provider.name;
  const glossary = loadGlossary(cwd, config);
  const lock = LockStore.from(loadLock(cwd));

  const requested = localesInput ? localesInput.split(",").map((s) => s.trim()).filter(Boolean) : config.targets;
  const targets = requested.filter((t) => config.targets.includes(t));
  const finalTargets = targets.length ? targets : config.targets;

  const event = readEvent();
  const pr = event?.pull_request;
  const isFork =
    !!pr && (pr.head.repo?.fork === true || (!!pr.head.repo?.full_name && pr.head.repo.full_name !== pr.base.repo?.full_name));

  const ghCtx = (): GitHubContext | null => {
    const repoFull = process.env.GITHUB_REPOSITORY;
    if (!pr || !token || !repoFull) return null;
    const [owner, repo] = repoFull.split("/");
    return {
      token,
      apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
      owner: owner!,
      repo: repo!,
      prNumber: pr.number,
    };
  };

  // ── Fork PR → read-only check ───────────────────────────────────────────
  if (isFork) {
    core.info("Fork PR detected — running LocaleCI in read-only check mode (no secrets).");
    const report = await checkProject({ cwd, config, glossary, lock, targets: finalTargets });
    const ctx = ghCtx();
    if (doComment && ctx) {
      try {
        await upsertComment(ctx, COMMENT_MARKER, buildCheckComment(report));
      } catch (e) {
        core.warning(`Could not post comment (fork PRs often lack write access): ${(e as Error).message}`);
      }
    }
    core.setOutput("translated", "0");
    core.setOutput("flagged", "0");
    core.setOutput("failed", String(report.issues.filter((i) => i.kind === "broken").length));
    if (!report.ok) core.setFailed("LocaleCI check found problems (see the PR comment).");
    return;
  }

  // ── Internal PR / push → translate ──────────────────────────────────────
  let provider;
  try {
    provider = createProviderFromConfig(config, { env, forceMock: providerOverride === "mock" });
  } catch (e) {
    core.setFailed((e as Error).message);
    return;
  }

  const report = await translateProject({
    cwd,
    config,
    glossary,
    provider,
    lock,
    today: today(),
    targets: finalTargets,
    write: true,
  });
  saveLock(cwd, lock.serialize());

  const totals = [...report.byLocale.values()].reduce(
    (a, l) => ({ translated: a.translated + l.translated, flagged: a.flagged + l.flagged, failed: a.failed + l.failed }),
    { translated: 0, flagged: 0, failed: 0 },
  );
  core.setOutput("translated", String(totals.translated));
  core.setOutput("flagged", String(totals.flagged));
  core.setOutput("failed", String(totals.failed));

  // Commit changed files + lockfile.
  if (doCommit && pr && report.changedFiles.length) {
    const files = [...new Set([...report.changedFiles, "localeci.lock.json"])];
    try {
      const committed = commitAndPush({ cwd, files, locales: finalTargets, branch: pr.head.ref });
      if (committed) core.info(`Committed ${report.changedFiles.length} file(s) to ${pr.head.ref}.`);
    } catch (e) {
      core.warning(`Could not commit/push: ${(e as Error).message}`);
    }
  }

  // Upsert the report comment.
  const ctx = ghCtx();
  if (doComment && ctx) {
    try {
      await upsertComment(ctx, COMMENT_MARKER, buildTranslateComment(report));
    } catch (e) {
      core.warning(`Could not post comment: ${(e as Error).message}`);
    }
  }

  core.info(`LocaleCI: ${totals.translated} translated, ${totals.flagged} flagged, ${totals.failed} failed.`);
  if (report.hasFailures && config.quality.onBelowThreshold === "fail") {
    core.setFailed("Some strings failed validation or fell below the quality threshold.");
  }
}

run().catch((e) => core.setFailed((e as Error).message));
