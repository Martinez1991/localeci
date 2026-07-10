import { describe, it, expect } from "vitest";
import { previewString, previewStrings, displayLength } from "./preview.js";

describe("displayLength", () => {
  it("ignores placeholders and tags", () => {
    expect(displayLength("Hello {name}")).toBe(displayLength("Hello •"));
    expect(displayLength("<b>Save</b>")).toBe("•Save•".length);
  });
});

describe("previewString", () => {
  it("fits a short button translation", () => {
    const r = previewString({ key: "b", source: "Save", target: "Salvar", kind: "button" });
    expect(r.status).toBe("fits");
  });

  it("flags overflow for a long button translation (de)", () => {
    const r = previewString({ key: "b", source: "Settings", target: "Benutzereinstellungen verwalten", kind: "button" });
    expect(r.status).toBe("overflow");
    expect(r.note).toContain("budget");
  });

  it("marks tight when just over budget", () => {
    // budget 14 for nav; 16 chars → within 1.25x → tight
    const r = previewString({ key: "n", source: "Home", target: "Zur Startseite!!", kind: "nav" });
    expect(r.status).toBe("tight");
  });

  it("notes large expansion even when it fits", () => {
    const r = previewString({ key: "t", source: "Go", target: "Weitermachen", kind: "tooltip" });
    expect(r.status).toBe("fits");
    expect(r.note).toContain("expands");
  });
});

describe("previewStrings summary", () => {
  it("counts fit statuses per locale", () => {
    const s = previewStrings("de", [
      { key: "a", source: "Save", target: "Speichern", kind: "button" },
      { key: "b", source: "Settings", target: "Benutzereinstellungen verwalten", kind: "button" },
    ]);
    expect(s.locale).toBe("de");
    expect(s.overflow).toBe(1);
    expect(s.fits + s.tight + s.overflow).toBe(2);
  });
});
