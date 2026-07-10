/**
 * Batching (spec §5.3): group by namespace, chunk to ~25, and (elsewhere) run a
 * few batches in parallel. Grouping by namespace keeps related strings together
 * so the model sees coherent context.
 */
export interface Batchable {
  key: string;
  tier: "cheap" | "top";
}

function namespaceOf(key: string): string {
  const idx = key.lastIndexOf(".");
  return idx === -1 ? "(root)" : key.slice(0, idx);
}

export function batchItems<T extends Batchable>(items: T[], batchSize: number): T[][] {
  // Group by (tier, namespace) so a batch shares a model and coherent context.
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const gk = `${it.tier}::${namespaceOf(it.key)}`;
    const arr = groups.get(gk) ?? [];
    arr.push(it);
    groups.set(gk, arr);
  }
  const batches: T[][] = [];
  for (const arr of groups.values()) {
    for (let i = 0; i < arr.length; i += batchSize) {
      batches.push(arr.slice(i, i + batchSize));
    }
  }
  return batches;
}

/** Run async tasks with a fixed concurrency limit (spec §5.3: 4 batches). */
export async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await worker(items[i]!, i);
    }
  });
  await Promise.all(runners);
  return results;
}
