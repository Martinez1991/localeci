import { describe, it, expect } from "vitest";
import { poParser } from "./po.js";

describe("po parser", () => {
  const singular = `msgid ""
msgstr ""
"Language: pt\\n"

#. greeting shown on home
msgid "Hello"
msgstr "Olá"

msgctxt "menu"
msgid "Home"
msgstr "Início"
`;

  it("parses singular entries with context", () => {
    const entries = poParser.parse(singular);
    expect(entries[0]).toEqual({ key: "Hello", value: "Olá", meta: undefined });
    expect(entries[1]!.key).toBe("menuHome");
    expect(entries[1]!.value).toBe("Início");
    expect(entries[1]!.meta?.context).toBe("menu");
  });

  it("preserves comments and updates only the msgstr", () => {
    const entries = poParser.parse(singular);
    entries[0]!.value = "Oi";
    const out = poParser.serialize(entries, singular);
    expect(out).toContain("#. greeting shown on home");
    expect(out).toContain('msgstr "Oi"');
  });

  it("exposes plural entries as ICU and expands them back", () => {
    const pluralPo = `msgid ""
msgstr ""
"Language: pt\\n"

msgid "One item"
msgid_plural "%d items"
msgstr[0] ""
msgstr[1] ""
msgstr[2] ""
`;
    const entries = poParser.parse(pluralPo);
    expect(entries[0]!.meta?.isIcu).toBe(true);
    expect(entries[0]!.value).toContain("plural");
    // Pretend the pipeline translated it to a pt ICU message.
    entries[0]!.value = "{count, plural, one {%d item} many {%d de itens} other {%d itens}}";
    const out = poParser.serialize(entries, pluralPo);
    expect(out).toContain('msgid_plural "%d items"');
    expect(out).toMatch(/msgstr\[0\] "%d item"/);
    expect(out).toMatch(/msgstr\[2\] "%d itens"/);
  });
});
