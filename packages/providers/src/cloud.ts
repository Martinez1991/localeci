/**
 * Cloud proxy provider (spec §8.2). The CLI sends batches to the LocaleCI cloud,
 * which calls the real provider with the platform's keys, meters usage, and
 * enforces plan limits. Same code path as BYO-key — different endpoint.
 */
import {
  type Provider,
  type TranslateBatch,
  type TranslateResult,
  type JudgeBatch,
  type JudgeResult,
  TranslateResponseSchema,
  JudgeResponseSchema,
} from "@localeci/core";
import { withRetry, ProviderError } from "./llm.js";

export interface CloudOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export function createCloudProvider(opts: CloudOptions): Provider {
  const baseUrl = opts.baseUrl ?? "https://localeci.dev";
  const doFetch = opts.fetchImpl ?? fetch;

  const post = async (path: string, body: unknown): Promise<Response> =>
    withRetry(async () => {
      const resp = await doFetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const retryable = resp.status === 429 || resp.status >= 500;
        throw new ProviderError(`Cloud ${resp.status}: ${(await resp.text()).slice(0, 300)}`, retryable);
      }
      return resp;
    });

  return {
    name: "cloud",
    async translate(batch: TranslateBatch): Promise<TranslateResult> {
      const resp = await post("/api/v1/translate", batch);
      const data = (await resp.json()) as { translations: unknown; model?: string; tokensIn?: number; tokensOut?: number };
      const parsed = TranslateResponseSchema.parse(data);
      return {
        translations: parsed.translations,
        model: data.model ?? "cloud",
        tokensIn: data.tokensIn ?? 0,
        tokensOut: data.tokensOut ?? 0,
      };
    },
    async judge(batch: JudgeBatch): Promise<JudgeResult> {
      const resp = await post("/api/v1/judge", batch);
      const data = (await resp.json()) as { scores: unknown; model?: string; tokensIn?: number; tokensOut?: number };
      const parsed = JudgeResponseSchema.parse(data);
      return {
        scores: parsed.scores,
        model: data.model ?? "cloud",
        tokensIn: data.tokensIn ?? 0,
        tokensOut: data.tokensOut ?? 0,
      };
    },
  };
}
