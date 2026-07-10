import { describe, it, expect } from "vitest";
import { markdownParser } from "./markdown.js";

const doc = `---
title: Guide
---

# Getting started

Welcome to the docs. This paragraph is prose.

\`\`\`ts
const x = 1; // code, not translated
\`\`\`

Another paragraph with a [link](/url) and \`inline code\`.

<Callout>JSX passthrough</Callout>

| a | b |
|---|---|
| 1 | 2 |
`;

describe("markdown parser", () => {
  it("round-trips exactly when nothing changes", () => {
    const entries = markdownParser.parse(doc);
    expect(markdownParser.serialize(entries, doc)).toBe(doc);
  });

  it("marks prose translatable and everything else verbatim", () => {
    const entries = markdownParser.parse(doc);
    const prose = entries.filter((e) => e.meta?.translatable !== false);
    const proseText = prose.map((e) => e.value);
    expect(proseText).toContain("# Getting started");
    expect(proseText.some((t) => t.startsWith("Welcome to the docs"))).toBe(true);
    expect(proseText.some((t) => t.includes("[link](/url)"))).toBe(true);
    // Frontmatter, code, JSX, table are NOT translatable.
    const nonProse = entries.filter((e) => e.meta?.translatable === false).map((e) => e.value).join("\n");
    expect(nonProse).toContain("title: Guide");
    expect(nonProse).toContain("const x = 1");
    expect(nonProse).toContain("<Callout>");
    expect(nonProse).toContain("|---|---|");
  });

  it("GOLDEN RULE: translating a paragraph only changes that block", () => {
    const entries = markdownParser.parse(doc);
    const target = entries.map((e) =>
      e.value.startsWith("Welcome") ? { ...e, value: "Bem-vindo aos docs. Este parágrafo é prosa." } : e,
    );
    const out = markdownParser.serialize(target, doc);
    expect(out).toContain("Bem-vindo aos docs");
    expect(out).toContain("const x = 1; // code, not translated"); // code untouched
    expect(out).toContain("title: Guide"); // frontmatter untouched
    expect(out).toContain("| 1 | 2 |"); // table untouched
    // Structure preserved: same number of lines.
    expect(out.split("\n").length).toBe(doc.split("\n").length);
  });

  it("gives duplicate prose blocks distinct keys", () => {
    const dup = "Note.\n\nNote.\n";
    const entries = markdownParser.parse(dup).filter((e) => e.meta?.translatable !== false);
    const keys = entries.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
