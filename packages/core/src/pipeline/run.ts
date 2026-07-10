/**
 * Pipeline orchestrator (spec §5): parse → diff → context → batch → translate →
 * validate → judge → score → decide → produce updated entries + lock.
 *
 * Pure of the filesystem: callers pass parsed entries and receive the entries
 * to serialize back. Code-level context is injected via `codeContext`.
 */
import type { FlatEntry, Locale } from "../types.js";
import type { Config } from "../config.js";
import type { Provider, TranslateItem, JudgeItem, ModelTier } from "../provider.js";
import type { ResolvedTerm } from "../glossary.js";
import { LockStore, lockHash } from "../lockfile.js";
import { diffLocale, needsTranslation } from "../diff.js";
import { validateTranslation } from "../validators/index.js";
import { buildContext } from "./context.js";
import { classifyTier } from "./routing.js";
import { batchItems, withConcurrency } from "./batch.js";
import { decide, type Decision } from "./score.js";

export interface PerStringResult {
  key: string;
  locale: Locale;
  source: string;
  target: string;
  score: number;
  decision: Decision;
  tier: ModelTier;
  issues: string[];
}

export interface LocaleRunResult {
  locale: Locale;
  /** Final entries to serialize into the target file. */
  entries: FlatEntry[];
  results: PerStringResult[];
  translatedCount: number;
  flaggedCount: number;
  failedCount: number;
  avgScore: number;
  tokensIn: number;
  tokensOut: number;
  /** True if any string should fail CI. */
  hasFailures: boolean;
}

export interface RunLocaleParams {
  sourceLocale: Locale;
  targetLocale: Locale;
  source: FlatEntry[];
  target: FlatEntry[];
  lock: LockStore;
  provider: Provider;
  config: Config;
  glossary: ResolvedTerm[];
  codeContext?: Map<string, string>;
  today: string; // YYYY-MM-DD, injected for determinism
}

const CONCURRENCY = 4;

export async function runLocale(params: RunLocaleParams): Promise<LocaleRunResult> {
  const { sourceLocale, targetLocale, source, target, lock, provider, config, glossary, codeContext, today } = params;

  const diff = diffLocale({ sourceLocale, targetLocale, source, target, lock });
  const todo = needsTranslation(diff);
  const targetMap = new Map(target.map((e) => [e.key, e.value]));
  const sourceMap = new Map(source.map((e) => [e.key, e]));

  // Prepare translate items with context + tier.
  interface Prepared extends TranslateItem {
    key: string;
    tier: ModelTier;
  }
  const prepared: Prepared[] = todo.map((d) => {
    const entry = sourceMap.get(d.key)!;
    const ctx = buildContext(entry, source, { codeContext: codeContext ?? new Map() });
    const isIcu = entry.meta?.isIcu === true;
    const tier = classifyTier({ key: d.key, text: d.source, targetLocale, isIcu });
    const item: Prepared = { id: d.key, key: d.key, text: d.source, tier };
    if (ctx.summary) item.context = ctx.summary;
    if (ctx.neighbors.length) item.neighbors = ctx.neighbors;
    if (isIcu) item.isIcu = true;
    return item;
  });

  const batches = batchItems(prepared, config.batchSize);

  // Translate all batches with bounded concurrency.
  const translationMap = new Map<string, string>();
  let tokensIn = 0;
  let tokensOut = 0;
  const modelByKey = new Map<string, string>();

  await withConcurrency(batches, CONCURRENCY, async (batch) => {
    const tier = batch[0]!.tier;
    try {
      const res = await provider.translate({
        sourceLocale,
        targetLocale,
        tier,
        items: batch.map(({ id, text, context, neighbors, isIcu }) => ({
          id,
          text,
          ...(context ? { context } : {}),
          ...(neighbors ? { neighbors } : {}),
          ...(isIcu ? { isIcu } : {}),
        })),
        style: config.style,
        glossary: glossary.map((g) => ({ term: g.term, target: g.target, neverTranslate: g.neverTranslate })),
      });
      tokensIn += res.tokensIn;
      tokensOut += res.tokensOut;
      for (const t of res.translations) {
        translationMap.set(t.id, t.text);
        modelByKey.set(t.id, res.model);
      }
    } catch {
      // Batch failed after provider retries; its items stay untranslated and
      // surface as failures below.
    }
  });

  // Validate deterministically.
  const validated = todo.map((d) => {
    const target = translationMap.get(d.key);
    const validation =
      target === undefined
        ? { ok: false, issues: [{ validator: "provider", severity: "error" as const, message: "No translation returned" }] }
        : validateTranslation({
            source: d.source,
            target,
            targetLocale,
            glossary,
            meta: sourceMap.get(d.key)?.meta,
          });
    return { key: d.key, source: d.source, target: target ?? "", validation };
  });

  // Judge the ones that passed validation (cheap batch).
  const judgeItems: JudgeItem[] = validated
    .filter((v) => v.validation.ok)
    .map((v) => ({ id: v.key, source: v.source, target: v.target }));

  const judgeScoreMap = new Map<string, import("../provider.js").JudgeScore>();
  if (judgeItems.length > 0) {
    // Judge in chunks of up to 50 (spec §5.6).
    const chunks: JudgeItem[][] = [];
    for (let i = 0; i < judgeItems.length; i += 50) chunks.push(judgeItems.slice(i, i + 50));
    await withConcurrency(chunks, CONCURRENCY, async (chunk) => {
      try {
        const res = await provider.judge({ sourceLocale, targetLocale, items: chunk });
        tokensIn += res.tokensIn;
        tokensOut += res.tokensOut;
        for (const s of res.scores) judgeScoreMap.set(s.id, s);
      } catch {
        // Judge failure → treat as unscored (score 100 fallback in decide()).
      }
    });
  }

  // Decide + assemble results.
  const results: PerStringResult[] = [];
  const finalTargetMap = new Map(targetMap);

  for (const v of validated) {
    const prep = prepared.find((p) => p.id === v.key)!;
    const judge = judgeScoreMap.get(v.key);
    const d = decide({
      validation: v.validation,
      judge,
      threshold: config.quality.threshold,
      onBelowThreshold: config.quality.onBelowThreshold,
    });
    const issues = [
      ...v.validation.issues.map((i) => i.message),
      ...(judge?.issues ?? []),
    ];
    results.push({
      key: v.key,
      locale: targetLocale,
      source: v.source,
      target: v.target,
      score: d.score,
      decision: d.decision,
      tier: prep.tier,
      issues,
    });

    if (d.write) {
      finalTargetMap.set(v.key, v.target);
      const hash = lockHash({ sourceLocale, key: v.key, sourceText: v.source, targetLocale });
      lock.set(hash, {
        source: v.source,
        target: v.target,
        locale: targetLocale,
        score: d.score,
        model: modelByKey.get(v.key) ?? provider.name,
        approvedBy: "auto",
        translatedAt: today,
      });
    }
  }

  // Remove orphans unless kept.
  if (!config.keepOrphans) {
    for (const d of diff) {
      if (d.state === "orphan") finalTargetMap.delete(d.key);
    }
  }

  // Preserve source key order in the final target file.
  const orderedKeys = source.map((e) => e.key).filter((k) => finalTargetMap.has(k));
  const extraKeys = [...finalTargetMap.keys()].filter((k) => !sourceMap.has(k));
  const entries: FlatEntry[] = [...orderedKeys, ...extraKeys].map((k) => ({ key: k, value: finalTargetMap.get(k)! }));

  const written = results.filter((r) => r.decision === "written" || r.decision === "flagged");
  const flagged = results.filter((r) => r.decision === "flagged");
  const failed = results.filter((r) => r.decision === "failed");
  const scored = results.filter((r) => r.decision !== "failed");
  const avgScore = scored.length ? Math.round(scored.reduce((a, r) => a + r.score, 0) / scored.length) : 0;

  return {
    locale: targetLocale,
    entries,
    results,
    translatedCount: written.length,
    flaggedCount: flagged.length,
    failedCount: failed.length,
    avgScore,
    tokensIn,
    tokensOut,
    hasFailures: failed.length > 0,
  };
}
