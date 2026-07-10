import { describe, it, expect, vi } from "vitest";
import { InMemoryLru, translationKey, withCache } from "./cache.js";
import { createMockProvider } from "@localeci/providers";
import type { TranslateBatch, Provider } from "@localeci/core";

describe("InMemoryLru", () => {
  it("stores and retrieves, honoring TTL", async () => {
    let t = 1000;
    const c = new InMemoryLru<string>(10, () => t);
    await c.set("a", "1", 500);
    expect(await c.get("a")).toBe("1");
    t = 1600; // past TTL
    expect(await c.get("a")).toBeUndefined();
  });

  it("evicts the least-recently-used past capacity", async () => {
    const c = new InMemoryLru<string>(2);
    await c.set("a", "1");
    await c.set("b", "2");
    await c.get("a"); // touch a → b is now LRU
    await c.set("c", "3"); // evicts b
    expect(await c.get("b")).toBeUndefined();
    expect(await c.get("a")).toBe("1");
    expect(await c.get("c")).toBe("3");
  });

  it("translationKey is stable and input-sensitive", () => {
    expect(translationKey("en", "de", "cheap", "Save")).toBe(translationKey("en", "de", "cheap", "Save"));
    expect(translationKey("en", "de", "cheap", "Save")).not.toBe(translationKey("en", "fr", "cheap", "Save"));
  });
});

function batch(texts: string[]): TranslateBatch {
  return {
    sourceLocale: "en",
    targetLocale: "de",
    tier: "cheap",
    items: texts.map((t, i) => ({ id: `k${i}`, text: t })),
    style: { tone: "professional", audience: "SaaS", notes: "" },
    glossary: [],
  };
}

describe("withCache", () => {
  it("serves cache hits and only sends misses to the provider", async () => {
    const cache = new InMemoryLru<string>();
    const base = createMockProvider();
    const spy = vi.fn(base.translate);
    const provider: Provider = { ...base, translate: spy };
    const cached = withCache(provider, cache);

    const first = await cached.translate(batch(["Save", "Cancel"]));
    expect(first.translations).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0].items).toHaveLength(2); // both misses

    // Second call: one repeat + one new → only the new one hits the provider.
    spy.mockClear();
    const second = await cached.translate(batch(["Save", "Delete"]));
    expect(second.translations.map((t) => t.id)).toEqual(["k0", "k1"]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0].items).toHaveLength(1); // only "Delete"
    expect(spy.mock.calls[0]![0].items[0]!.text).toBe("Delete");
  });

  it("returns identical output to the uncached provider (order preserved)", async () => {
    const base = createMockProvider();
    const cached = withCache(base, new InMemoryLru<string>());
    const uncached = await base.translate(batch(["Home", "About", "Pricing"]));
    const withC = await cached.translate(batch(["Home", "About", "Pricing"]));
    expect(withC.translations).toEqual(uncached.translations);
  });

  it("a fully-cached batch spends zero provider tokens", async () => {
    const cache = new InMemoryLru<string>();
    const cached = withCache(createMockProvider(), cache);
    await cached.translate(batch(["Save"]));
    const again = await cached.translate(batch(["Save"]));
    expect(again.tokensIn).toBe(0);
    expect(again.tokensOut).toBe(0);
  });
});
