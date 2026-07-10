/**
 * Cost estimation (spec §9). Approximate USD pricing per 1M tokens, matched by
 * substring of the model id. Rates are ballpark and easy to update; the goal is
 * order-of-magnitude cost visibility in the CLI and PR comment, not billing.
 */
interface Rate {
  in: number; // USD per 1M input tokens
  out: number; // USD per 1M output tokens
}

// Ordered: first substring match wins.
const TABLE: Array<[RegExp, Rate]> = [
  [/mock/i, { in: 0, out: 0 }],
  [/haiku/i, { in: 1, out: 5 }],
  [/sonnet/i, { in: 3, out: 15 }],
  [/opus/i, { in: 15, out: 75 }],
  [/gpt-4o-mini|4o-mini/i, { in: 0.15, out: 0.6 }],
  [/gpt-4o|4o/i, { in: 2.5, out: 10 }],
  [/gpt-4/i, { in: 10, out: 30 }],
];

const DEFAULT_RATE: Rate = { in: 2, out: 8 };

export function rateForModel(model: string): Rate {
  for (const [re, rate] of TABLE) if (re.test(model)) return rate;
  return DEFAULT_RATE;
}

export function estimateCost(params: { model: string; tokensIn: number; tokensOut: number }): number {
  const rate = rateForModel(params.model);
  return (params.tokensIn * rate.in + params.tokensOut * rate.out) / 1_000_000;
}
