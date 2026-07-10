/**
 * Anthropic provider. Uses the Messages API via fetch (no SDK dep). Prompts are
 * built by @localeci/core so all providers stay prompt-consistent.
 */
import {
  type Provider,
  type TranslateBatch,
  type TranslateResult,
  type JudgeBatch,
  type JudgeResult,
  TranslateResponseSchema,
  JudgeResponseSchema,
  buildTranslatePrompt,
  buildJudgePrompt,
} from "@localeci/core";
import { callAndParse, withRetry, ProviderError, type ChatFn, type ChatMessage } from "./llm.js";

export interface AnthropicOptions {
  apiKey: string;
  baseUrl?: string;
  models?: { cheap?: string; top?: string; judge?: string };
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULTS = {
  cheap: "claude-haiku-4-5-20251001",
  top: "claude-sonnet-5",
  judge: "claude-haiku-4-5-20251001",
};

export function createAnthropicProvider(opts: AnthropicOptions): Provider {
  const baseUrl = opts.baseUrl ?? "https://api.anthropic.com";
  const doFetch = opts.fetchImpl ?? fetch;
  const models = { ...DEFAULTS, ...opts.models };

  const chat: ChatFn = async (messages: ChatMessage, purpose, tier) => {
    const model = purpose === "judge" ? models.judge : tier === "top" ? models.top : models.cheap;
    return withRetry(async () => {
      const resp = await doFetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": opts.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 4096,
          system: messages.system,
          messages: [{ role: "user", content: messages.user }],
        }),
      });
      if (!resp.ok) {
        const retryable = resp.status === 429 || resp.status >= 500;
        throw new ProviderError(`Anthropic ${resp.status}: ${await safeText(resp)}`, retryable);
      }
      const data = (await resp.json()) as {
        content: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = data.content.map((c) => c.text ?? "").join("");
      return {
        text,
        tokensIn: data.usage?.input_tokens ?? 0,
        tokensOut: data.usage?.output_tokens ?? 0,
        model,
      };
    });
  };

  return {
    name: "anthropic",
    async translate(batch: TranslateBatch): Promise<TranslateResult> {
      const prompt = buildTranslatePrompt(batch);
      const { value, tokensIn, tokensOut, model } = await callAndParse(
        chat,
        prompt,
        TranslateResponseSchema,
        "translate",
        batch.tier,
      );
      return { translations: value.translations, model, tokensIn, tokensOut };
    },
    async judge(batch: JudgeBatch): Promise<JudgeResult> {
      const prompt = buildJudgePrompt(batch);
      const { value, tokensIn, tokensOut, model } = await callAndParse(
        chat,
        prompt,
        JudgeResponseSchema,
        "judge",
        "cheap",
      );
      return { scores: value.scores.map((s) => ({ ...s, issues: s.issues ?? [] })), model, tokensIn, tokensOut };
    },
  };
}

async function safeText(resp: Response): Promise<string> {
  try {
    return (await resp.text()).slice(0, 300);
  } catch {
    return "(no body)";
  }
}
