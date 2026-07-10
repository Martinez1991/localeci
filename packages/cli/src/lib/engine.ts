/**
 * Filesystem orchestration around the pure pipeline. Iterates source files ×
 * target locales, runs the engine, and (for translate) writes files + lock.
 */
import {
  runLocale,
  diffLocale,
  coverage,
  validateTranslation,
  getParser,
  LockStore,
  resolveGlossaryForLocale,
  type Config,
  type Glossary,
  type Provider,
  type FlatEntry,
  type PerStringResult,
  type CoverageRow,
} from "@localeci/core";
import {
  resolveSourceFiles,
  deriveTargetPath,
  readFileIfExists,
  writeFileEnsuringDir,
} from "./project.js";

export interface FileLocaleResult {
  file: string;
  targetPath: string;
  locale: string;
  results: PerStringResult[];
  translatedCount: number;
  flaggedCount: number;
  failedCount: number;
  avgScore: number;
  changed: boolean;
}

export interface TranslateReport {
  perFile: FileLocaleResult[];
  byLocale: Map<string, { translated: number; flagged: number; failed: number; scoreSum: number; scored: number }>;
  tokensIn: number;
  tokensOut: number;
  hasFailures: boolean;
  changedFiles: string[];
}

export interface RunOptions {
  cwd: string;
  config: Config;
  glossary: Glossary;
  provider: Provider;
  lock: LockStore;
  today: string;
  targets: string[];
  codeContext?: Map<string, string>;
  write: boolean;
}

export async function translateProject(opts: RunOptions): Promise<TranslateReport> {
  const { cwd, config, glossary, provider, lock, today, targets, codeContext, write } = opts;
  const parser = getParser(config.source.format);
  const sourceFiles = await resolveSourceFiles(cwd, config.source.files);

  const report: TranslateReport = {
    perFile: [],
    byLocale: new Map(),
    tokensIn: 0,
    tokensOut: 0,
    hasFailures: false,
    changedFiles: [],
  };

  for (const file of sourceFiles) {
    const sourceRaw = readFileIfExists(cwd, file);
    const source = parser.parse(sourceRaw);
    if (source.length === 0) continue;

    for (const locale of targets) {
      const targetPath = deriveTargetPath(file, config.source.locale, locale);
      const targetRaw = readFileIfExists(cwd, targetPath);
      const target = targetRaw ? parser.parse(targetRaw) : [];
      const resolvedGlossary = resolveGlossaryForLocale(glossary, locale);

      const res = await runLocale({
        sourceLocale: config.source.locale,
        targetLocale: locale,
        source,
        target,
        lock,
        provider,
        config,
        glossary: resolvedGlossary,
        ...(codeContext ? { codeContext } : {}),
        today,
      });

      report.tokensIn += res.tokensIn;
      report.tokensOut += res.tokensOut;
      if (res.hasFailures) report.hasFailures = true;

      // Did the serialized output change?
      const newRaw = parser.serialize(res.entries, targetRaw);
      const changed = newRaw !== targetRaw;
      if (changed && write) {
        writeFileEnsuringDir(cwd, targetPath, newRaw);
        report.changedFiles.push(targetPath);
      }

      report.perFile.push({
        file,
        targetPath,
        locale,
        results: res.results,
        translatedCount: res.translatedCount,
        flaggedCount: res.flaggedCount,
        failedCount: res.failedCount,
        avgScore: res.avgScore,
        changed,
      });

      const agg = report.byLocale.get(locale) ?? { translated: 0, flagged: 0, failed: 0, scoreSum: 0, scored: 0 };
      agg.translated += res.translatedCount;
      agg.flagged += res.flaggedCount;
      agg.failed += res.failedCount;
      for (const r of res.results) {
        if (r.decision !== "failed") {
          agg.scoreSum += r.score;
          agg.scored += 1;
        }
      }
      report.byLocale.set(locale, agg);
    }
  }

  return report;
}

// ── check (offline validation, no LLM) ────────────────────────────────────

export interface CheckIssue {
  file: string;
  locale: string;
  key: string;
  kind: "missing" | "stale" | "broken" | "below-threshold";
  message: string;
}

export interface CheckReport {
  coverage: CoverageRow[];
  issues: CheckIssue[];
  ok: boolean;
}

export interface CheckOptions {
  cwd: string;
  config: Config;
  glossary: Glossary;
  lock: LockStore;
  targets: string[];
}

export async function checkProject(opts: CheckOptions): Promise<CheckReport> {
  const { cwd, config, glossary, lock, targets } = opts;
  const parser = getParser(config.source.format);
  const sourceFiles = await resolveSourceFiles(cwd, config.source.files);
  const issues: CheckIssue[] = [];
  const covByLocale = new Map<string, CoverageRow>();

  for (const file of sourceFiles) {
    const source = parser.parse(readFileIfExists(cwd, file));
    if (source.length === 0) continue;
    const sourceMap = new Map(source.map((e) => [e.key, e]));

    for (const locale of targets) {
      const targetPath = deriveTargetPath(file, config.source.locale, locale);
      const targetRaw = readFileIfExists(cwd, targetPath);
      const target: FlatEntry[] = targetRaw ? parser.parse(targetRaw) : [];
      const targetMap = new Map(target.map((e) => [e.key, e]));
      const resolvedGlossary = resolveGlossaryForLocale(glossary, locale);

      const diff = diffLocale({ sourceLocale: config.source.locale, targetLocale: locale, source, target, lock });
      for (const d of diff) {
        if (d.state === "missing") {
          issues.push({ file, locale, key: d.key, kind: "missing", message: "not translated" });
        } else if (d.state === "stale") {
          issues.push({ file, locale, key: d.key, kind: "stale", message: "source changed since translation" });
        }
      }

      // Validate existing translations deterministically.
      for (const t of target) {
        const src = sourceMap.get(t.key);
        if (!src) continue; // orphan; not a check failure by default
        const validation = validateTranslation({
          source: src.value,
          target: t.value,
          targetLocale: locale,
          glossary: resolvedGlossary,
          ...(src.meta ? { meta: src.meta } : {}),
        });
        if (!validation.ok) {
          const msg = validation.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ");
          issues.push({ file, locale, key: t.key, kind: "broken", message: msg });
        }
      }

      // Score threshold via lock.
      for (const [key, entry] of targetMap) {
        const src = sourceMap.get(key);
        if (!src) continue;
        const lookup = lock.lookup({ sourceLocale: config.source.locale, key, sourceText: src.value, targetLocale: locale });
        if (lookup && lookup.score < config.quality.threshold) {
          issues.push({
            file,
            locale,
            key,
            kind: "below-threshold",
            message: `score ${lookup.score} < threshold ${config.quality.threshold}`,
          });
        }
      }

      const cov = coverage(locale, diff);
      const prev = covByLocale.get(locale);
      if (prev) {
        prev.total += cov.total;
        prev.translated += cov.translated;
        prev.missing += cov.missing;
        prev.stale += cov.stale;
        prev.orphan += cov.orphan;
        prev.percent = prev.total === 0 ? 100 : Math.round((prev.translated / prev.total) * 100);
      } else {
        covByLocale.set(locale, { ...cov });
      }
    }
  }

  return {
    coverage: [...covByLocale.values()],
    issues,
    ok: issues.filter((i) => i.kind !== "stale").length === 0,
  };
}
