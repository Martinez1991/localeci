/** `localeci check` — validate without translating (CI mode). */
import { LockStore } from "@localeci/core";
import { log, c, table } from "../lib/output.js";
import { loadConfig, loadGlossary, loadLock } from "../lib/project.js";
import { checkProject } from "../lib/engine.js";

export interface CheckOptions {
  cwd: string;
  to?: string[];
  /** Treat missing/stale as failures too (default true). */
  strict?: boolean;
}

export async function cmdCheck(opts: CheckOptions): Promise<number> {
  const { cwd } = opts;
  const { config } = loadConfig(cwd);
  const glossary = loadGlossary(cwd, config);
  const lock = LockStore.from(loadLock(cwd));
  const targets = opts.to && opts.to.length ? config.targets.filter((t) => opts.to!.includes(t)) : config.targets;

  const report = await checkProject({ cwd, config, glossary, lock, targets });

  const rows = report.coverage.map((c) => [c.locale, `${c.percent}%`, String(c.translated), String(c.missing), String(c.stale)]);
  log.info(table(["Locale", "Coverage", "Done", "Missing", "Stale"], rows));
  log.info("");

  const broken = report.issues.filter((i) => i.kind === "broken");
  const missing = report.issues.filter((i) => i.kind === "missing");
  const below = report.issues.filter((i) => i.kind === "below-threshold");

  if (broken.length) {
    log.error(`${broken.length} broken translation(s):`);
    for (const i of broken.slice(0, 25)) log.info(`  ${c.red("✘")} ${c.dim(i.locale)} ${i.key} — ${i.message}`);
    log.info("");
  }
  if (below.length) {
    log.warn(`${below.length} translation(s) below quality threshold:`);
    for (const i of below.slice(0, 15)) log.info(`  ${c.yellow("⚠")} ${c.dim(i.locale)} ${i.key} — ${i.message}`);
    log.info("");
  }
  if (missing.length) {
    log.warn(`${missing.length} string(s) not yet translated. Run ${c.cyan("localeci translate")}.`);
  }

  const fail = broken.length > 0 || below.length > 0 || (opts.strict !== false && missing.length > 0);
  if (fail) {
    log.error("check failed.");
    return 1;
  }
  log.success("check passed.");
  return 0;
}
