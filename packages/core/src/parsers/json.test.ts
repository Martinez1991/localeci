import { describe, it, expect } from "vitest";
import { jsonParser } from "./json.js";

describe("json parser", () => {
  const original = `{
  "greeting": "Hello",
  "nav": {
    "home": "Home",
    "about": "About"
  }
}
`;

  it("parses nested JSON into flat entries", () => {
    expect(jsonParser.parse(original)).toEqual([
      { key: "greeting", value: "Hello" },
      { key: "nav.home", value: "Home" },
      { key: "nav.about", value: "About" },
    ]);
  });

  it("GOLDEN RULE: changing one value only changes that line", () => {
    const entries = jsonParser.parse(original);
    entries[1]!.value = "Início"; // nav.home
    const out = jsonParser.serialize(entries, original);
    // Only nav.home changed; order + indentation + trailing newline preserved.
    expect(out).toBe(`{
  "greeting": "Hello",
  "nav": {
    "home": "Início",
    "about": "About"
  }
}
`);
  });

  it("appends new keys at the end, preserving existing order", () => {
    const entries = jsonParser.parse(original);
    entries.push({ key: "nav.contact", value: "Contact" });
    const out = jsonParser.serialize(entries, original);
    expect(out).toContain(`"about": "About",\n    "contact": "Contact"`);
  });

  it("removes orphaned keys not present in entries", () => {
    const entries = jsonParser.parse(original).filter((e) => e.key !== "nav.about");
    const out = jsonParser.serialize(entries, original);
    expect(out).not.toContain("about");
  });

  it("detects tab indentation", () => {
    const tabbed = `{\n\t"a": "1"\n}\n`;
    const entries = jsonParser.parse(tabbed);
    const out = jsonParser.serialize(entries, tabbed);
    expect(out).toBe(tabbed);
  });

  it("serializes into an empty target file", () => {
    const out = jsonParser.serialize([{ key: "a.b", value: "x" }], "");
    expect(JSON.parse(out)).toEqual({ a: { b: "x" } });
  });
});
