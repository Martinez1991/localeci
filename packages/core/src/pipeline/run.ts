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
import { tokenSimilarity, cosineSimilarity } from "./similarity.js";
import { estimateCost } from "../pricing.js";
import type { SemanticMemory, SemanticEntry } from "../semantic.js";

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
  costUsd: number;
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
  /** Override config.quality.paranoid (back-translation cross-check). */
  paranoid?: boolean;
  /** Optional semantic translation memory for cross-namespace few-shot (spec §13). */
  semanticMemory?: SemanticMemory;
}

const CONCURRENCY = 4;

export async function runLocale(params: RunLocaleParams): Promise<LocaleRunResult> {
  const { sourceLocale, targetLocale, source, target, lock, provider, config, glossary, codeContext, today, semanticMemory } = params;

  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd = 0;

  const diff = diffLocale({ sourceLocale, targetLocale, source, target, lock });
  const targetMap = new Map(target.map((e) => [e.key, e.value]));
  const sourceMap = new Map(source.map((e) => [e.key, e]));

  // Non-translatable entries (meta.translatable === false) are copied verbatim
  // and never sent to the LLM (e.g. Markdown code/frontmatter segments).
  const isTranslatable = (key: string): boolean => sourceMap.get(key)?.meta?.translatable !== false;
  const todo = needsTranslation(diff).filter((d) => isTranslatable(d.key));

  // Human learning loop (spec §5.7): a locked string whose on-disk target no
  // longer matches the lock (source unchanged) was edited by a human in review
  // → re-lock as human-approved (immutable) and reuse as a few-shot example.
  const humanExamplesByNs = new Map<string, Array<{ source: string; target: string }>>();
  for (const s of source) {
    const existing = lock.lookup({ sourceLocale, key: s.key, sourceText: s.value, targetLocale });
    if (!existing) continue;
    const onDisk = targetMap.get(s.key);
    if (onDisk !== undefined && onDisk !== existing.target) {
      const hash = lockHash({ sourceLocale, key: s.key, sourceText: s.value, targetLocale });
      lock.set(hash, { ...existing, target: onDisk, approvedBy: "human", translatedAt: today });
    }
    const approved = lock.lookup({ sourceLocale, key: s.key, sourceText: s.value, targetLocale });
    if (approved?.approvedBy === "human") {
      const ns = namespaceOf(s.key);
      const arr = humanExamplesByNs.get(ns) ?? [];
      arr.push({ source: s.value, target: approved.target });
      humanExamplesByNs.set(ns, arr);
    }
  }

  // Semantic TM (optional): embed the strings to translate and pull the nearest
  // approved translations as few-shot examples, even across namespaces.
  const semanticExamplesByKey = new Map<string, Array<{ source: string; target: string }>>();
  const todoVectors = new Map<string, number[]>();
  if (semanticMemory && provider.embed && todo.length) {
    try {
      const emb = await provider.embed(todo.map((d) => d.source));
      costUsd += estimateCost({ model: emb.model, tokensIn: emb.tokens, tokensOut: 0 });
      for (let i = 0; i < todo.length; i++) {
        const vec = emb.vectors[i];
        if (!vec) continue;
        todoVectors.set(todo[i]!.key, vec);
        const matches = await semanticMemory.query(vec, targetLocale, 3);
        if (matches.length) {
          semanticExamplesByKey.set(
            todo[i]!.key,
            matches.map((m) => ({ source: m.source, target: m.target })),
          );
        }
      }
    } catch {
      // Semantic lookup is best-effort; fall back to namespace examples.
    }
  }

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
    // Merge semantic + namespace examples, dedupe by target, cap at 3.
    const merged: Array<{ source: string; target: string }> = [];
    const seenTargets = new Set<string>();
    for (const e of [...(semanticExamplesByKey.get(d.key) ?? []), ...(humanExamplesByNs.get(namespaceOf(d.key)) ?? [])]) {
      if (e.source === d.source || seenTargets.has(e.target)) continue;
      seenTargets.add(e.target);
      merged.push(e);
    }
    const examples = merged.slice(0, 3);
    if (examples.length) item.examples = examples;
    return item;
  });

  const batches = batchItems(prepared, config.batchSize);

  // Translate all batches with bounded concurrency.
  const translationMap = new Map<string, string>();
  const modelByKey = new Map<string, string>();

  await withConcurrency(batches, CONCURRENCY, async (batch) => {
    const tier = batch[0]!.tier;
    try {
      const res = await provider.translate({
        sourceLocale,
        targetLocale,
        tier,
        items: batch.map(({ id, text, context, neighbors, isIcu, examples }) => ({
          id,
          text,
          ...(context ? { context } : {}),
          ...(neighbors ? { neighbors } : {}),
          ...(isIcu ? { isIcu } : {}),
          ...(examples ? { examples } : {}),
        })),
        style: config.style,
        glossary: glossary.map((g) => ({ term: g.term, target: g.target, neverTranslate: g.neverTranslate })),
      });
      tokensIn += res.tokensIn;
      tokensOut += res.tokensOut;
      costUsd += estimateCost({ model: res.model, tokensIn: res.tokensIn, tokensOut: res.tokensOut });
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
        costUsd += estimateCost({ model: res.model, tokensIn: res.tokensIn, tokensOut: res.tokensOut });
        for (const s of res.scores) judgeScoreMap.set(s.id, s);
      } catch {
        // Judge failure → treat as unscored (score 100 fallback in decide()).
      }
    });
  }

  // Back-translation cross-check (spec §5.6, --paranoid): translate the
  // candidate back to the source language and compare to the original source.
  const paranoid = params.paranoid ?? config.quality.paranoid;
  const backSimilarityMap = new Map<string, number>();
  if (paranoid) {
    const candidates = validated.filter((v) => v.validation.ok && v.target !== "");
    const backChunks: Array<Array<{ id: string; text: string; source: string }>> = [];
    for (let i = 0; i < candidates.length; i += config.batchSize) {
      backChunks.push(candidates.slice(i, i + config.batchSize).map((v) => ({ id: v.key, text: v.target, source: v.source })));
    }
    await withConcurrency(backChunks, CONCURRENCY, async (chunk) => {
      try {
        const res = await provider.translate({
          sourceLocale: targetLocale,
          targetLocale: sourceLocale,
          tier: "cheap",
          items: chunk.map((c) => ({ id: c.id, text: c.text })),
          style: config.style,
          glossary: [],
        });
        tokensIn += res.tokensIn;
        tokensOut += res.tokensOut;
        costUsd += estimateCost({ model: res.model, tokensIn: res.tokensIn, tokensOut: res.tokensOut });
        const backMap = new Map(res.translations.map((t) => [t.id, t.text]));

        const pairs = chunk
          .map((c) => ({ id: c.id, source: c.source, back: backMap.get(c.id) }))
          .filter((p): p is { id: string; source: string; back: string } => p.back !== undefined);

        // Prefer embeddings when the provider supports them; else token overlap.
        if (provider.embed && pairs.length) {
          try {
            const texts = pairs.flatMap((p) => [p.source, p.back]);
            const emb = await provider.embed(texts);
            costUsd += estimateCost({ model: emb.model, tokensIn: emb.tokens, tokensOut: 0 });
            pairs.forEach((p, i) => {
              const sv = emb.vectors[i * 2];
              const bv = emb.vectors[i * 2 + 1];
              if (sv && bv) backSimilarityMap.set(p.id, cosineSimilarity(sv, bv));
              else backSimilarityMap.set(p.id, tokenSimilarity(p.source, p.back));
            });
          } catch {
            for (const p of pairs) backSimilarityMap.set(p.id, tokenSimilarity(p.source, p.back));
          }
        } else {
          for (const p of pairs) backSimilarityMap.set(p.id, tokenSimilarity(p.source, p.back));
        }
      } catch {
        // Back-translation failure → leave similarity unset (no penalty).
      }
    });
  }

  // Decide + assemble results.
  const results: PerStringResult[] = [];
  const finalTargetMap = new Map(targetMap);
  const semanticAdditions: SemanticEntry[] = [];

  for (const v of validated) {
    const prep = prepared.find((p) => p.id === v.key)!;
    const judge = judgeScoreMap.get(v.key);
    const backSimilarity = backSimilarityMap.get(v.key);
    const d = decide({
      validation: v.validation,
      judge,
      threshold: config.quality.threshold,
      onBelowThreshold: config.quality.onBelowThreshold,
      ...(backSimilarity !== undefined ? { backSimilarity } : {}),
    });
    const issues = [
      ...v.validation.issues.map((i) => i.message),
      ...(judge?.issues ?? []),
      ...(backSimilarity !== undefined && backSimilarity < 0.5
        ? [`back-translation diverged from source (similarity ${backSimilarity.toFixed(2)})`]
        : []),
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
      const vec = todoVectors.get(v.key);
      if (semanticMemory && vec) semanticAdditions.push({ source: v.source, target: v.target, locale: targetLocale, vector: vec });
    }
  }

  // Grow the semantic memory with what we just wrote (best-effort).
  if (semanticMemory && semanticAdditions.length) {
    try {
      await semanticMemory.add(semanticAdditions);
    } catch {
      /* non-fatal */
    }
  }

  // Copy non-translatable entries verbatim from source (Markdown code/structure).
  for (const s of source) {
    if (s.meta?.translatable === false) finalTargetMap.set(s.key, s.value);
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
    costUsd,
    hasFailures: failed.length > 0,
  };
}

function namespaceOf(key: string): string {
  const idx = key.lastIndexOf(".");
  return idx === -1 ? "" : key.slice(0, idx);
}
