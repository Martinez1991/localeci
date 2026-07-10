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

/** Cosine similarity of two vectors, clamped to 0..1. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return Math.max(0, dot / (Math.sqrt(na) * Math.sqrt(nb)));
}

/**
 * Deterministic hashing bag-of-words vector — a cheap stand-in for real
 * embeddings used by the mock provider so embedding-based `--paranoid` works
 * offline. Cross-language pairs won't align (that's expected of a hash), so the
 * mock is mainly for wiring/tests; real embeddings come from a provider.
 */
export function hashingVector(text: string, dim = 256): number[] {
  const vec = new Array(dim).fill(0);
  for (const tok of normalizeTokens(text)) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    vec[Math.abs(h) % dim] += 1;
  }
  return vec;
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
