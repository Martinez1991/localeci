import { describe, it, expect, vi } from "vitest";
import { runLocale, LockStore, parseConfig, type FlatEntry, type Provider } from "@localeci/core";
import { createMockProvider } from "./mock.js";

const config = parseConfig({
  source: { locale: "en", files: "x", format: "i18next" },
  targets: ["pt-BR"],
  provider: { name: "mock" },
  quality: { threshold: 70, onBelowThreshold: "flag", paranoid: true },
});

const source: FlatEntry[] = [{ key: "nav.save", value: "Save changes" }];

describe("embedding-based --paranoid", () => {
  it("mock exposes embed and returns deterministic vectors", async () => {
    const mock = createMockProvider();
    expect(mock.embed).toBeTypeOf("function");
    const e = await mock.embed!(["hello", "hello"]);
    expect(e.vectors[0]).toEqual(e.vectors[1]);
    expect(e.model).toBe("mock/embed-1");
  });

  it("paranoid uses provider.embed when available", async () => {
    const base = createMockProvider();
    const embedSpy = vi.fn(base.embed!);
    const provider: Provider = { ...base, embed: embedSpy };

    const res = await runLocale({
      sourceLocale: "en", targetLocale: "pt-BR", source, target: [], lock: new LockStore(),
      provider, config, glossary: [], today: "2026-07-09",
    });

    expect(embedSpy).toHaveBeenCalled();
    // Round-trip is faithful (mock accents vowels; diacritics stripped) → high score kept.
    expect(res.results[0]!.score).toBeGreaterThanOrEqual(90);
  });

  it("falls back to token similarity when embed is absent", async () => {
    const base = createMockProvider();
    const provider: Provider = { name: base.name, translate: base.translate, judge: base.judge }; // no embed

    const res = await runLocale({
      sourceLocale: "en", targetLocale: "pt-BR", source, target: [], lock: new LockStore(),
      provider, config, glossary: [], today: "2026-07-09",
    });
    expect(res.results[0]!.decision).not.toBe("failed");
  });
});
