/**
 * Semantic translation memory (spec §13 trigger: pgvector / few-shot).
 *
 * Stores embeddings of approved source strings → their translations, and
 * retrieves the nearest approved pairs for a new string so the LLM can match a
 * reviewer's prior wording even when the key/namespace differs. This is the
 * semantic upgrade to the namespace-based few-shot of the human learning loop
 * (§5.7).
 *
 * The engine depends only on this interface. `MemorySemanticMemory` is the
 * offline/in-memory implementation; the cloud provides a pgvector-backed one.
 */
import { cosineSimilarity } from "./pipeline/similarity.js";

export interface SemanticEntry {
  source: string;
  target: string;
  locale: string;
  vector: number[];
}

export interface SemanticMatch {
  source: string;
  target: string;
  score: number;
}

export interface SemanticMemory {
  add(entries: SemanticEntry[]): Promise<void>;
  /** Nearest approved translations for a query vector, best first. */
  query(vector: number[], locale: string, k: number, minScore?: number): Promise<SemanticMatch[]>;
}

export class MemorySemanticMemory implements SemanticMemory {
  private entries: SemanticEntry[] = [];

  async add(entries: SemanticEntry[]): Promise<void> {
    for (const e of entries) {
      // De-dupe on (locale, source): keep the latest.
      const existing = this.entries.findIndex((x) => x.locale === e.locale && x.source === e.source);
      if (existing >= 0) this.entries[existing] = e;
      else this.entries.push(e);
    }
  }

  async query(vector: number[], locale: string, k: number, minScore = 0.6): Promise<SemanticMatch[]> {
    return this.entries
      .filter((e) => e.locale === locale)
      .map((e) => ({ source: e.source, target: e.target, score: cosineSimilarity(vector, e.vector) }))
      .filter((m) => m.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  get size(): number {
    return this.entries.length;
  }
}
