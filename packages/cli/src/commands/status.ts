/** `localeci status` — coverage table per locale. */
import { LockStore } from "@localeci/core";
import { log, table, c } from "../lib/output.js";
import { loadConfig, loadGlossary, loadLock } from "../lib/project.js";
import { checkProject } from "../lib/engine.js";

export async function cmdStatus(opts: { cwd: string }): Promise<number> {
  const { cwd } = opts;
  const { config } = loadConfig(cwd);
  const glossary = loadGlossary(cwd, config);
  const lock = LockStore.from(loadLock(cwd));

  const report = await checkProject({ cwd, config, glossary, lock, targets: config.targets });

  log.info(c.bold(`Source: ${config.source.locale} · ${config.source.files}`));
  log.info("");
  const rows = report.coverage.map((cov) => {
    const bar = renderBar(cov.percent);
    return [cov.locale, bar, `${cov.percent}%`, String(cov.translated), String(cov.missing), String(cov.stale), String(cov.orphan)];
  });
  log.info(table(["Locale", "Progress", "%", "Done", "Missing", "Stale", "Orphan"], rows));
  return 0;
}

function renderBar(percent: number): string {
  const width = 20;
  const filled = Math.round((percent / 100) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return percent >= 100 ? c.green(bar) : percent >= 50 ? c.yellow(bar) : c.red(bar);
}
