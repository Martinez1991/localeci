/**
 * pgvector-backed semantic translation memory (spec §13). Implements the core
 * `SemanticMemory` interface against Postgres + pgvector, scoped to one org.
 * Reference implementation (needs Drizzle + a pgvector database).
 */
import { and, eq, sql } from "drizzle-orm";
import type { SemanticMemory, SemanticEntry, SemanticMatch } from "@localeci/core";
import { db, schema } from "../db/index.js";

export class DbSemanticMemory implements SemanticMemory {
  constructor(private orgId: string) {}

  async add(entries: SemanticEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await db
      .insert(schema.translationVectors)
      .values(
        entries.map((e) => ({
          orgId: this.orgId,
          locale: e.locale,
          source: e.source,
          target: e.target,
          embedding: e.vector,
        })),
      )
      .onConflictDoUpdate({
        target: [schema.translationVectors.orgId, schema.translationVectors.locale, schema.translationVectors.source],
        set: { target: sql`excluded.target`, embedding: sql`excluded.embedding` },
      });
  }

  async query(vector: number[], locale: string, k: number, minScore = 0.6): Promise<SemanticMatch[]> {
    // Cosine distance = 1 - cosine similarity; order ascending, filter by score.
    const literal = `[${vector.join(",")}]`;
    const rows = await db
      .select({
        source: schema.translationVectors.source,
        target: schema.translationVectors.target,
        score: sql<number>`1 - (${schema.translationVectors.embedding} <=> ${literal}::vector)`,
      })
      .from(schema.translationVectors)
      .where(and(eq(schema.translationVectors.orgId, this.orgId), eq(schema.translationVectors.locale, locale)))
      .orderBy(sql`${schema.translationVectors.embedding} <=> ${literal}::vector`)
      .limit(k);
    return rows.filter((r) => Number(r.score) >= minScore).map((r) => ({ source: r.source, target: r.target, score: Number(r.score) }));
  }
}
