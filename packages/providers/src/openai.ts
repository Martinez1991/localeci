/**
 * OpenAI provider. Chat Completions API via fetch, JSON response format.
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

export interface OpenAIOptions {
  apiKey: string;
  baseUrl?: string;
  models?: { cheap?: string; top?: string; judge?: string };
  fetchImpl?: typeof fetch;
}

const DEFAULTS = {
  cheap: "gpt-4o-mini",
  top: "gpt-4o",
  judge: "gpt-4o-mini",
};

export function createOpenAIProvider(opts: OpenAIOptions): Provider {
  const baseUrl = opts.baseUrl ?? "https://api.openai.com";
  const doFetch = opts.fetchImpl ?? fetch;
  const models = { ...DEFAULTS, ...opts.models };

  const chat: ChatFn = async (messages: ChatMessage, purpose, tier) => {
    const model = purpose === "judge" ? models.judge : tier === "top" ? models.top : models.cheap;
    return withRetry(async () => {
      const resp = await doFetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: messages.system },
            { role: "user", content: messages.user },
          ],
        }),
      });
      if (!resp.ok) {
        const retryable = resp.status === 429 || resp.status >= 500;
        throw new ProviderError(`OpenAI ${resp.status}: ${await safeText(resp)}`, retryable);
      }
      const data = (await resp.json()) as {
        choices: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        text: data.choices[0]?.message?.content ?? "",
        tokensIn: data.usage?.prompt_tokens ?? 0,
        tokensOut: data.usage?.completion_tokens ?? 0,
        model,
      };
    });
  };

  const embedModel = process.env.LOCALECI_OPENAI_EMBED_MODEL ?? "text-embedding-3-small";

  return {
    name: "openai",
    async embed(texts: string[]) {
      return withRetry(async () => {
        const resp = await doFetch(`${baseUrl}/v1/embeddings`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` },
          body: JSON.stringify({ model: embedModel, input: texts }),
        });
        if (!resp.ok) {
          const retryable = resp.status === 429 || resp.status >= 500;
          throw new ProviderError(`OpenAI embeddings ${resp.status}: ${await safeText(resp)}`, retryable);
        }
        const data = (await resp.json()) as {
          data: Array<{ embedding: number[]; index: number }>;
          usage?: { total_tokens?: number };
        };
        const vectors = [...data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
        return { vectors, model: embedModel, tokens: data.usage?.total_tokens ?? 0 };
      });
    },
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
