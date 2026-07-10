import { describe, it, expect } from "vitest";
import { playgroundTranslate } from "./playground.js";
import { createMockProvider } from "@localeci/providers";

describe("playgroundTranslate", () => {
  it("translates a single string and returns a score + decision", async () => {
    const r = await playgroundTranslate(
      { source: "Save changes", sourceLocale: "en", targetLocale: "pt-BR" },
      createMockProvider(),
      "2026-07-10",
    );
    expect(r.translation.length).toBeGreaterThan(0);
    expect(r.score).toBeGreaterThan(0);
    expect(["written", "flagged"]).toContain(r.decision);
    expect(r.targetLocale).toBe("pt-BR");
  });

  it("preserves placeholders and reports them as issues if broken", async () => {
    const r = await playgroundTranslate(
      { source: "Hello {name}", sourceLocale: "en", targetLocale: "de" },
      createMockProvider(),
      "2026-07-10",
    );
    expect(r.translation).toContain("{name}");
  });

  it("respects a never-translate glossary term", async () => {
    const r = await playgroundTranslate(
      {
        source: "Open workspace",
        sourceLocale: "en",
        targetLocale: "pt-BR",
        glossary: { terms: [{ term: "workspace", translations: {}, note: "never translate" }] },
      },
      createMockProvider(),
      "2026-07-10",
    );
    expect(r.translation).toContain("workspace");
    expect(r.decision).not.toBe("failed");
  });
});
