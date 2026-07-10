import { describe, it, expect } from "vitest";
import {
  runLocale,
  LockStore,
  parseConfig,
  resolveGlossaryForLocale,
  jsonParser,
  type FlatEntry,
} from "@localeci/core";
import { createMockProvider } from "./mock.js";

const config = parseConfig({
  source: { locale: "en", files: "locales/en/**/*.json", format: "i18next" },
  targets: ["pt-BR", "pl", "ja"],
  provider: { name: "mock" },
  quality: { threshold: 80, onBelowThreshold: "flag" },
});

const source: FlatEntry[] = [
  { key: "nav.home", value: "Home" },
  { key: "nav.save", value: "Save changes" },
  { key: "checkout.items", value: "{count, plural, one {# item} other {# items}}", meta: { isIcu: true } },
  { key: "greeting", value: "Hello {name}" },
];

describe("pipeline e2e (mock provider)", () => {
  it("translates all missing strings and writes them", async () => {
    const lock = new LockStore();
    const res = await runLocale({
      sourceLocale: "en",
      targetLocale: "pt-BR",
      source,
      target: [],
      lock,
      provider: createMockProvider(),
      config,
      glossary: [],
      today: "2026-07-09",
    });
    expect(res.translatedCount).toBe(4);
    expect(res.failedCount).toBe(0);
    expect(res.avgScore).toBeGreaterThanOrEqual(80);
    // Placeholder preserved.
    const greeting = res.entries.find((e) => e.key === "greeting")!;
    expect(greeting.value).toContain("{name}");
  });

  it("produces valid ICU with the target locale's plural categories (Polish gets `few`)", async () => {
    const lock = new LockStore();
    const res = await runLocale({
      sourceLocale: "en",
      targetLocale: "pl",
      source,
      target: [],
      lock,
      provider: createMockProvider(),
      config,
      glossary: [],
      today: "2026-07-09",
    });
    const icu = res.entries.find((e) => e.key === "checkout.items")!;
    expect(icu.value).toContain("few {");
    const failed = res.results.filter((r) => r.decision === "failed");
    expect(failed).toHaveLength(0);
  });

  it("is idempotent: a second run with a full lock translates nothing", async () => {
    const lock = new LockStore();
    const first = await runLocale({
      sourceLocale: "en", targetLocale: "pt-BR", source, target: [], lock,
      provider: createMockProvider(), config, glossary: [], today: "2026-07-09",
    });
    const targetEntries = first.entries;
    const second = await runLocale({
      sourceLocale: "en", targetLocale: "pt-BR", source, target: targetEntries, lock,
      provider: createMockProvider(), config, glossary: [], today: "2026-07-09",
    });
    expect(second.translatedCount).toBe(0);
    expect(second.tokensOut).toBe(0);
  });

  it("serializes translated entries back to a JSON file", async () => {
    const lock = new LockStore();
    const res = await runLocale({
      sourceLocale: "en", targetLocale: "pt-BR", source, target: [], lock,
      provider: createMockProvider(), config, glossary: [], today: "2026-07-09",
    });
    const out = jsonParser.serialize(res.entries, "{}\n");
    const parsed = JSON.parse(out);
    expect(parsed.nav.home).toBeTruthy();
    expect(parsed.greeting).toContain("{name}");
  });

  it("respects glossary never-translate terms end to end", async () => {
    const glossaryCfg = { terms: [{ term: "workspace", translations: {}, note: "never translate" }] };
    const glossary = resolveGlossaryForLocale(glossaryCfg, "pt-BR");
    const lock = new LockStore();
    const res = await runLocale({
      sourceLocale: "en", targetLocale: "pt-BR",
      source: [{ key: "nav.ws", value: "Open workspace" }],
      target: [], lock, provider: createMockProvider(), config, glossary, today: "2026-07-09",
    });
    // The mock is glossary-aware: "workspace" is kept verbatim, so it validates.
    expect(res.results[0]!.decision).not.toBe("failed");
    expect(res.entries[0]!.value).toContain("workspace");
  });
});
