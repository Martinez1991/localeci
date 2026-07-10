import { describe, it, expect } from "vitest";
import { parseConfig, ConfigError } from "./config.js";

describe("config", () => {
  it("applies sensible defaults", () => {
    const cfg = parseConfig({
      source: { locale: "en", files: "locales/en/**/*.json", format: "i18next" },
      targets: ["pt-BR"],
    });
    expect(cfg.quality.threshold).toBe(85);
    expect(cfg.quality.onBelowThreshold).toBe("flag");
    expect(cfg.provider.name).toBe("anthropic");
    expect(cfg.batchSize).toBe(25);
    expect(cfg.keepOrphans).toBe(false);
    expect(cfg.style.tone).toBe("professional");
  });

  it("accepts the documented example config", () => {
    const cfg = parseConfig({
      $schema: "https://localeci.dev/schema.json",
      source: { locale: "en", files: "locales/en/**/*.json", format: "i18next" },
      targets: ["pt-BR", "es", "de", "fr", "ja"],
      provider: { name: "anthropic", apiKeyEnv: "LOCALECI_KEY" },
      quality: { threshold: 85, onBelowThreshold: "flag" },
      glossary: "localeci.glossary.json",
      context: { scanCode: true, include: ["src/**/*.{tsx,jsx,ts}"] },
      style: { tone: "professional", audience: "SaaS product UI", notes: "Prefer 'você'." },
    });
    expect(cfg.targets).toHaveLength(5);
    expect(cfg.context.scanCode).toBe(true);
  });

  it("throws a helpful error pointing at the offending field", () => {
    expect(() => parseConfig({ source: { locale: "en" }, targets: [] })).toThrow(ConfigError);
    try {
      parseConfig({ source: { locale: "en", files: "x", format: "bogus" }, targets: ["de"] });
    } catch (e) {
      expect((e as Error).message).toContain("source.format");
    }
  });

  it("rejects an out-of-range threshold", () => {
    expect(() =>
      parseConfig({
        source: { locale: "en", files: "x", format: "json" },
        targets: ["de"],
        quality: { threshold: 200, onBelowThreshold: "flag" },
      }),
    ).toThrow(ConfigError);
  });
});
