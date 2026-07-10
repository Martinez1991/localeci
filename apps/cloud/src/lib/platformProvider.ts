/**
 * The platform provider: the cloud calls the real LLM with LocaleCI's OWN keys
 * (spec §8.2). Configured via env, defaulting to Anthropic.
 */
import type { Provider, Config } from "@localeci/core";
import { createProviderFromConfig } from "@localeci/providers";

let cached: Provider | null = null;

export function platformProvider(): Provider {
  if (cached) return cached;
  const name = (process.env.LOCALECI_PLATFORM_PROVIDER ?? "anthropic") as "anthropic" | "openai" | "mock";
  const config = {
    provider: { name },
  } as unknown as Config;
  cached = createProviderFromConfig(config, {
    env: process.env,
    forceMock: name === "mock",
  });
  return cached;
}
