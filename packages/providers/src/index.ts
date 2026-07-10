import type { Provider, Config } from "@localeci/core";
import { createMockProvider } from "./mock.js";
import { createAnthropicProvider } from "./anthropic.js";
import { createOpenAIProvider } from "./openai.js";
import { createCloudProvider } from "./cloud.js";

export { createMockProvider } from "./mock.js";
export { createAnthropicProvider } from "./anthropic.js";
export { createOpenAIProvider } from "./openai.js";
export { createCloudProvider } from "./cloud.js";
export { ProviderError, extractJson } from "./llm.js";

export class MissingApiKeyError extends Error {
  override name = "MissingApiKeyError";
}

export interface ProviderFactoryEnv {
  /** Environment variables (process.env). */
  env: Record<string, string | undefined>;
  /** Force the mock provider regardless of config (tests, CI without keys). */
  forceMock?: boolean;
  fetchImpl?: typeof fetch;
}

/**
 * Resolve a concrete provider from config + environment. Honors
 * `provider.apiKeyEnv` for BYO-key mode and `LOCALECI_KEY`/`LOCALECI_CLOUD_URL`
 * for the cloud.
 */
export function createProviderFromConfig(config: Config, opts: ProviderFactoryEnv): Provider {
  const { env, forceMock, fetchImpl } = opts;
  const p = config.provider;

  if (forceMock || p.name === "mock") return createMockProvider();

  const keyFromEnv = (name?: string): string | undefined => (name ? env[name] : undefined);

  if (p.name === "cloud") {
    const apiKey = keyFromEnv(p.apiKeyEnv) ?? env.LOCALECI_KEY;
    if (!apiKey) throw new MissingApiKeyError("Cloud provider needs LOCALECI_KEY (or provider.apiKeyEnv).");
    const base: Parameters<typeof createCloudProvider>[0] = { apiKey };
    if (p.baseUrl ?? env.LOCALECI_CLOUD_URL) base.baseUrl = p.baseUrl ?? env.LOCALECI_CLOUD_URL!;
    if (fetchImpl) base.fetchImpl = fetchImpl;
    return createCloudProvider(base);
  }

  if (p.name === "anthropic") {
    const apiKey = keyFromEnv(p.apiKeyEnv) ?? env.ANTHROPIC_API_KEY ?? env.LOCALECI_KEY;
    if (!apiKey) throw new MissingApiKeyError(`Anthropic provider needs an API key (set ${p.apiKeyEnv ?? "ANTHROPIC_API_KEY"}).`);
    const base: Parameters<typeof createAnthropicProvider>[0] = { apiKey };
    if (p.models) base.models = p.models;
    if (fetchImpl) base.fetchImpl = fetchImpl;
    return createAnthropicProvider(base);
  }

  if (p.name === "openai") {
    const apiKey = keyFromEnv(p.apiKeyEnv) ?? env.OPENAI_API_KEY ?? env.LOCALECI_KEY;
    if (!apiKey) throw new MissingApiKeyError(`OpenAI provider needs an API key (set ${p.apiKeyEnv ?? "OPENAI_API_KEY"}).`);
    const base: Parameters<typeof createOpenAIProvider>[0] = { apiKey };
    if (p.models) base.models = p.models;
    if (fetchImpl) base.fetchImpl = fetchImpl;
    return createOpenAIProvider(base);
  }

  return createMockProvider();
}
