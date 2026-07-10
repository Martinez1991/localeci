/**
 * The platform provider: the cloud calls the real LLM with LocaleCI's OWN keys
 * (spec §8.2). Configured via env, defaulting to Anthropic.
 */
import type { Provider, Config } from "@localeci/core";
import { createProviderFromConfig } from "@localeci/providers";
import { InMemoryLru, withCache, type Cache } from "./cache.js";

let cached: Provider | null = null;
let cachedWithCache: Provider | null = null;
// Hot TM cache (issue #18). Swap for KvCache(kv) in production.
const tmCache: Cache<string> = new InMemoryLru<string>(10_000);

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

/** Platform provider with a hot TM cache in front (issue #18) — used by the
 *  translate proxy so repeat strings never re-hit the LLM. */
export function cachedPlatformProvider(): Provider {
  if (cachedWithCache) return cachedWithCache;
  cachedWithCache = withCache(platformProvider(), tmCache);
  return cachedWithCache;
}
