import { describe, it, expect } from "vitest";
import { runLocale, LockStore, parseConfig, type FlatEntry, type Provider } from "@localeci/core";
import { createMockProvider } from "./mock.js";

describe("fine-tuned model routing", () => {
  it("passes provider.fineTuned[locale] as modelOverride to translate", async () => {
    const config = parseConfig({
      source: { locale: "en", files: "x", format: "i18next" },
      targets: ["pt-BR"],
      provider: { name: "mock", fineTuned: { "pt-BR": "ft:gpt-4o-mini:acme:localeci-ptbr" } },
      quality: { threshold: 70, onBelowThreshold: "flag" },
    });

    let captured: Parameters<Provider["translate"]>[0] | null = null;
    const base = createMockProvider();
    const spy: Provider = { name: "spy", translate: (b) => { captured = b; return base.translate(b); }, judge: (b) => base.judge(b) };

    const source: FlatEntry[] = [{ key: "a", value: "Save" }];
    await runLocale({
      sourceLocale: "en", targetLocale: "pt-BR", source, target: [], lock: new LockStore(),
      provider: spy, config, glossary: [], today: "2026-07-10",
    });
    expect(captured!.modelOverride).toBe("ft:gpt-4o-mini:acme:localeci-ptbr");
  });

  it("omits modelOverride when no fine-tuned model configured", async () => {
    const config = parseConfig({
      source: { locale: "en", files: "x", format: "i18next" },
      targets: ["de"],
      provider: { name: "mock" },
    });
    let captured: Parameters<Provider["translate"]>[0] | null = null;
    const base = createMockProvider();
    const spy: Provider = { name: "spy", translate: (b) => { captured = b; return base.translate(b); }, judge: (b) => base.judge(b) };
    await runLocale({
      sourceLocale: "en", targetLocale: "de", source: [{ key: "a", value: "Save" }], target: [], lock: new LockStore(),
      provider: spy, config, glossary: [], today: "2026-07-10",
    });
    expect(captured!.modelOverride).toBeUndefined();
  });
});
