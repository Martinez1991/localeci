/** `localeci translate` — translate missing/changed strings for target locales. */
import { LockStore, resolveGlossaryForLocale } from "@localeci/core";
import { createProviderFromConfig, MissingApiKeyError } from "@localeci/providers";
import { log, c, table, scoreColor } from "../lib/output.js";
import { loadConfig, loadGlossary, loadLock, saveLock } from "../lib/project.js";
import { scanCodeContext } from "../lib/codeContext.js";
import { translateProject } from "../lib/engine.js";

export interface TranslateOptions {
  cwd: string;
  to?: string[]; // subset of target locales
  mock?: boolean;
  today: string;
  env: Record<string, string | undefined>;
}

export async function cmdTranslate(opts: TranslateOptions): Promise<number> {
  const { cwd } = opts;
  const { config } = loadConfig(cwd);
  const glossary = loadGlossary(cwd, config);
  const lock = LockStore.from(loadLock(cwd));

  const targets = opts.to && opts.to.length ? config.targets.filter((t) => opts.to!.includes(t)) : config.targets;
  if (targets.length === 0) {
    log.error(`None of the requested locales are in your config targets (${config.targets.join(", ")}).`);
    return 1;
  }

  let provider;
  try {
    provider = createProviderFromConfig(config, { env: opts.env, forceMock: opts.mock });
  } catch (e) {
    if (e instanceof MissingApiKeyError) {
      log.error(e.message);
      log.dim("Tip: run with --mock to try the pipeline without any API key.");
      return 1;
    }
    throw e;
  }

  let codeContext: Map<string, string> | undefined;
  if (config.context.scanCode && config.context.include.length) {
    log.step("Scanning code for string context…");
    codeContext = await scanCodeContext({ cwd, include: config.context.include });
    log.dim(`  found context for ${codeContext.size} keys`);
  }

  log.step(`Translating to ${c.bold(targets.join(", "))} via ${c.bold(provider.name)}…`);

  const report = await translateProject({
    cwd,
    config,
    glossary,
    provider,
    lock,
    today: opts.today,
    targets,
    ...(codeContext ? { codeContext } : {}),
    write: true,
  });

  saveLock(cwd, lock.serialize());

  // Report.
  const rows = [...report.byLocale.entries()].map(([locale, a]) => [
    locale,
    String(a.translated),
    a.scored ? scoreColor(Math.round(a.scoreSum / a.scored)) : "—",
    a.flagged ? c.yellow(String(a.flagged)) : "0",
    a.failed ? c.red(String(a.failed)) : "0",
  ]);
  log.info("");
  log.info(table(["Locale", "Written", "Avg score", "Flagged", "Failed"], rows));
  log.info("");

  // Flagged/failed detail.
  const notable = report.perFile.flatMap((f) => f.results.filter((r) => r.decision === "flagged" || r.decision === "failed").map((r) => ({ ...r, file: f.file })));
  if (notable.length) {
    log.info(c.bold("Needs attention:"));
    for (const r of notable.slice(0, 20)) {
      const mark = r.decision === "failed" ? c.red("✘") : c.yellow("⚠");
      log.info(`  ${mark} ${c.dim(r.locale)} ${r.key} — score ${scoreColor(r.score)} — ${r.issues[0] ?? r.decision}`);
    }
    if (notable.length > 20) log.dim(`  …and ${notable.length - 20} more`);
    log.info("");
  }

  if (report.changedFiles.length) {
    log.success(`Updated ${report.changedFiles.length} file(s). Tokens: ${report.tokensIn} in / ${report.tokensOut} out.`);
  } else {
    log.success(`Everything up to date — nothing to translate. (0 tokens, $0)`);
  }

  return report.hasFailures ? 1 : 0;
}
