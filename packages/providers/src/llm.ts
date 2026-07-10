/**
 * Shared LLM plumbing: JSON extraction, Zod-validated parsing with a single
 * retry (spec §5.4 — malformed → 1 retry with the error appended → then fail),
 * and exponential-backoff retry for transient HTTP/rate-limit errors.
 */
import type { z } from "zod";

export class ProviderError extends Error {
  override name = "ProviderError";
  constructor(message: string, readonly retryable = false) {
    super(message);
  }
}

/** Pull a JSON object out of a model response, tolerating ```json fences. */
export function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1]!.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

export interface ChatMessage {
  system: string;
  user: string;
}

/** A concrete backend call: send system+user, get raw text + token usage. */
export type ChatFn = (
  messages: ChatMessage,
  purpose: "translate" | "judge",
  tier: "cheap" | "top",
) => Promise<{ text: string; tokensIn: number; tokensOut: number; model: string }>;

/**
 * Call the model, validate the JSON with Zod, and retry ONCE with the parse
 * error appended to the prompt if it comes back malformed.
 */
export async function callAndParse<T>(
  chat: ChatFn,
  messages: ChatMessage,
  schema: z.ZodType<T>,
  purpose: "translate" | "judge",
  tier: "cheap" | "top",
): Promise<{ value: T; tokensIn: number; tokensOut: number; model: string }> {
  let tokensIn = 0;
  let tokensOut = 0;
  let model = "";
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const msg =
      attempt === 0
        ? messages
        : {
            system: messages.system,
            user: `${messages.user}\n\nYour previous response was invalid JSON: ${lastError}\nReturn ONLY valid JSON matching the schema.`,
          };
    const res = await chat(msg, purpose, tier);
    tokensIn += res.tokensIn;
    tokensOut += res.tokensOut;
    model = res.model;
    try {
      const json = JSON.parse(extractJson(res.text));
      const parsed = schema.safeParse(json);
      if (parsed.success) return { value: parsed.data, tokensIn, tokensOut, model };
      lastError = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  throw new ProviderError(`Model returned malformed JSON after retry: ${lastError}`);
}

/** Retry a fetch-based call with exponential backoff on retryable errors. */
export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let attempt = 0;
  // Deterministic backoff schedule (no jitter → testable).
  const delays = [500, 1500, 4000];
  while (true) {
    try {
      return await fn();
    } catch (e) {
      const retryable = e instanceof ProviderError ? e.retryable : true;
      attempt++;
      if (!retryable || attempt >= maxAttempts) throw e;
      await new Promise((r) => setTimeout(r, delays[Math.min(attempt - 1, delays.length - 1)]));
    }
  }
}
