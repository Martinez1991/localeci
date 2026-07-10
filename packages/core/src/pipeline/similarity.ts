/**
 * Text similarity for back-translation (spec §5.6, `--paranoid`).
 *
 * MVP uses a deterministic token-set Jaccard over normalized words — no
 * embeddings, no network, no cost. It catches the gross failures back-translation
 * is meant to catch (dropped clauses, negation flips, hallucinated content) while
 * staying reproducible in tests. Embedding-based similarity is a future upgrade.
 */
function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\p{M}]/gu, "") // strip diacritics
    .replace(/\{[^}]*\}|%[\d$]*[sdfeg@]|<\/?[^>]+>/g, " ") // drop placeholders/tags
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Jaccard similarity of the two token sets, 0..1. */
export function tokenSimilarity(a: string, b: string): number {
  const sa = new Set(normalizeTokens(a));
  const sb = new Set(normalizeTokens(b));
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 1 : inter / union;
}
