import { describe, it, expect } from "vitest";
import { runLocale, LockStore, parseConfig, markdownParser } from "@localeci/core";
import { createMockProvider } from "./mock.js";

const config = parseConfig({
  source: { locale: "en", files: "docs/en/**/*.md", format: "markdown" },
  targets: ["pt-BR"],
  provider: { name: "mock" },
  quality: { threshold: 70, onBelowThreshold: "flag" },
});

const doc = `---
title: Guide
---

# Getting started

Welcome to the documentation.

\`\`\`ts
const x = 1;
\`\`\`
`;

describe("markdown pipeline e2e (mock)", () => {
  it("translates prose, copies code/frontmatter verbatim, and round-trips structure", async () => {
    const source = markdownParser.parse(doc);
    const res = await runLocale({
      sourceLocale: "en",
      targetLocale: "pt-BR",
      source,
      target: [],
      lock: new LockStore(),
      provider: createMockProvider(),
      config,
      glossary: [],
      today: "2026-07-09",
    });

    const out = markdownParser.serialize(res.entries, "");
    // Code + frontmatter untouched.
    expect(out).toContain("const x = 1;");
    expect(out).toContain("title: Guide");
    // Prose translated (mock accents vowels).
    expect(out).toContain("# Gèttìng stàrtèd");
    expect(out).not.toContain("Welcome to the documentation.");
    // Same line count → structure preserved.
    expect(out.split("\n").length).toBe(doc.split("\n").length);
    // Non-translatable segments are not scored.
    expect(res.results.every((r) => r.source.trim() !== "const x = 1;")).toBe(true);
  });
});
