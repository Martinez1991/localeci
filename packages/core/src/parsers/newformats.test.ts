import { describe, it, expect } from "vitest";
import { stringsParser } from "./strings.js";
import { androidParser } from "./androidXml.js";
import { fluentParser } from "./fluent.js";

describe("iOS .strings parser", () => {
  const original = `/* Greeting */
"greeting" = "Hello, %@!";
"nav.home" = "Home";
`;

  it("parses key/value pairs", () => {
    expect(stringsParser.parse(original)).toEqual([
      { key: "greeting", value: "Hello, %@!" },
      { key: "nav.home", value: "Home" },
    ]);
  });

  it("GOLDEN RULE: only changed values change; comments preserved", () => {
    const entries = stringsParser.parse(original);
    entries[1]!.value = "Início";
    const out = stringsParser.serialize(entries, original);
    expect(out).toBe(`/* Greeting */
"greeting" = "Hello, %@!";
"nav.home" = "Início";
`);
  });

  it("drops orphans and appends new keys, escaping quotes", () => {
    const entries = stringsParser.parse(original).filter((e) => e.key !== "nav.home");
    entries.push({ key: "quote", value: 'Say "hi"' });
    const out = stringsParser.serialize(entries, original);
    expect(out).not.toContain("nav.home");
    expect(out).toContain('"quote" = "Say \\"hi\\"";');
  });
});

describe("Android strings.xml parser", () => {
  const original = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- home -->
    <string name="greeting">Hello, %1$s!</string>
    <string name="translated" translatable="false">DontTouch</string>
    <plurals name="items">
        <item quantity="one">%d item</item>
        <item quantity="other">%d items</item>
    </plurals>
    <string-array name="days">
        <item>Mon</item>
    </string-array>
</resources>
`;

  it("parses strings and plurals (as ICU); skips translatable=false and arrays", () => {
    const entries = androidParser.parse(original);
    expect(entries.find((e) => e.key === "greeting")!.value).toBe("Hello, %1$s!");
    const plural = entries.find((e) => e.key === "items")!;
    expect(plural.meta?.isIcu).toBe(true);
    expect(plural.value).toContain("plural");
    // translatable=false and string-array are not surfaced as translatable.
    expect(entries.find((e) => e.key === "translated")).toBeUndefined();
    expect(entries.some((e) => e.key === "days")).toBe(false);
  });

  it("updates a string and preserves comments + untouched nodes", () => {
    const entries = androidParser.parse(original);
    entries.find((e) => e.key === "greeting")!.value = "Olá, %1$s!";
    const out = androidParser.serialize(entries, original);
    expect(out).toContain("<!-- home -->");
    expect(out).toContain('<string name="greeting">Olá, %1$s!</string>');
    // Passthrough nodes survive.
    expect(out).toContain('translatable="false"');
    expect(out).toContain("<string-array");
  });

  it("expands a translated ICU plural back into <item quantity> for the locale", () => {
    const entries = androidParser.parse(original);
    entries.find((e) => e.key === "items")!.value = "{count, plural, one {%d elemento} other {%d elementos}}";
    const out = androidParser.serialize(entries, original);
    expect(out).toMatch(/<item quantity="one">%d elemento<\/item>/);
    expect(out).toMatch(/<item quantity="other">%d elementos<\/item>/);
  });
});

describe("Fluent .ftl parser", () => {
  const original = `# App strings
greeting = Hello, { $name }!
home = Home
# a selector is preserved verbatim
emails =
    { $count ->
        [one] You have one email
       *[other] You have { $count } emails
    }
`;

  it("parses simple messages and leaves selectors alone", () => {
    const entries = fluentParser.parse(original);
    expect(entries).toEqual([
      { key: "greeting", value: "Hello, { $name }!" },
      { key: "home", value: "Home" },
    ]);
  });

  it("GOLDEN RULE: updates a simple message, preserves comments and the selector block", () => {
    const entries = fluentParser.parse(original);
    entries.find((e) => e.key === "home")!.value = "Início";
    const out = fluentParser.serialize(entries, original);
    expect(out).toContain("# App strings");
    expect(out).toContain("home = Início");
    expect(out).toContain("[one] You have one email");
    expect(out).toContain("greeting = Hello, { $name }!");
  });
});
