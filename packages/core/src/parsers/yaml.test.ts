import { describe, it, expect } from "vitest";
import { yamlParser } from "./yaml.js";
import { ParseError } from "./types.js";

describe("yaml parser", () => {
  const original = `# App strings
greeting: Hello
nav:
  home: Home   # main page
  about: About
`;

  it("parses nested YAML", () => {
    expect(yamlParser.parse(original)).toEqual([
      { key: "greeting", value: "Hello" },
      { key: "nav.home", value: "Home" },
      { key: "nav.about", value: "About" },
    ]);
  });

  it("preserves comments and order when editing one value", () => {
    const entries = yamlParser.parse(original);
    entries[1]!.value = "Início";
    const out = yamlParser.serialize(entries, original);
    expect(out).toContain("# App strings");
    expect(out).toContain("# main page");
    expect(out).toContain("home: Início");
    // greeting stays before nav
    expect(out.indexOf("greeting")).toBeLessThan(out.indexOf("nav"));
  });

  it("rejects anchors/aliases with a clear error", () => {
    const withAnchor = `defaults: &d\n  a: 1\nuse:\n  <<: *d\n`;
    expect(() => yamlParser.parse(withAnchor)).toThrow(ParseError);
  });
});
