/** `localeci dataset` — export a fine-tuning dataset from approved translations. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LockStore,
  buildFineTuneDataset,
  fineTuneReadiness,
  type FineTunePair,
  type DatasetFormat,
} from "@localeci/core";
import { log, c } from "../lib/output.js";
import { loadConfig, loadLock } from "../lib/project.js";

export interface DatasetOptions {
  cwd: string;
  format?: DatasetFormat;
  out?: string;
  includeAuto?: boolean;
  threshold?: number;
}

export async function cmdDataset(opts: DatasetOptions): Promise<number> {
  const { cwd } = opts;
  const { config } = loadConfig(cwd);
  const lock = LockStore.from(loadLock(cwd));

  const entries = Object.values(lock.data.entries);
  const pairs: FineTunePair[] = entries
    .filter((e) => (opts.includeAuto ? true : e.approvedBy === "human"))
    .map((e) => ({ source: e.source, target: e.target, locale: e.locale }));

  const format = opts.format ?? "openai";
  const outPath = resolve(cwd, opts.out ?? "localeci.dataset.jsonl");
  const jsonl = buildFineTuneDataset(pairs, { format, sourceLocale: config.source.locale, style: config.style });
  writeFileSync(outPath, jsonl, "utf8");

  const readiness = fineTuneReadiness(pairs, opts.threshold ?? 50_000_000);

  log.success(`Wrote ${pairs.length} example(s) to ${c.bold(opts.out ?? "localeci.dataset.jsonl")} (${format} format).`);
  log.info("");
  log.info(c.bold("Per-locale counts:"));
  for (const [locale, n] of Object.entries(readiness.byLocale).sort((a, b) => b[1] - a[1])) {
    log.info(`  ${locale.padEnd(8)} ${n}`);
  }
  log.info("");
  if (readiness.ready) {
    log.success(`Ready to fine-tune (${readiness.count} ≥ ${readiness.threshold.toLocaleString()} approved strings).`);
  } else {
    log.dim(
      `Not yet at the fine-tuning threshold: ${readiness.count.toLocaleString()} / ${readiness.threshold.toLocaleString()} ` +
        `(${readiness.needed.toLocaleString()} more human-approved strings needed).`,
    );
  }
  if (!opts.includeAuto && pairs.length === 0) {
    log.dim("Tip: no human-approved translations yet. Edit some in a PR (they re-lock as human), or pass --include-auto.");
  }
  return 0;
}
