import { describe, it, expect } from "vitest";
import { diffLocale, needsTranslation, coverage } from "./diff.js";
import { LockStore, lockHash, emptyLockfile } from "./lockfile.js";
import type { FlatEntry } from "./types.js";

const src: FlatEntry[] = [
  { key: "a", value: "Save" },
  { key: "b", value: "Cancel" },
  { key: "c", value: "Delete" },
];

function lockWith(key: string, sourceText: string, approvedBy: "human" | "auto") {
  const store = new LockStore(emptyLockfile());
  const h = lockHash({ sourceLocale: "en", key, sourceText, targetLocale: "pt-BR" });
  store.set(h, {
    source: sourceText,
    target: "X",
    locale: "pt-BR",
    score: 90,
    model: "m",
    approvedBy,
    translatedAt: "2026-07-08",
  });
  return store;
}

describe("diff", () => {
  it("marks untranslated keys as missing", () => {
    const d = diffLocale({ sourceLocale: "en", targetLocale: "pt-BR", source: src, target: [], lock: new LockStore() });
    expect(d.every((e) => e.state === "missing")).toBe(true);
    expect(needsTranslation(d)).toHaveLength(3);
  });

  it("marks locked-auto and locked-human correctly", () => {
    const lock = lockWith("a", "Save", "human");
    const d = diffLocale({ sourceLocale: "en", targetLocale: "pt-BR", source: src, target: [{ key: "a", value: "X" }], lock });
    expect(d.find((e) => e.key === "a")!.state).toBe("locked-human");
  });

  it("marks stale when target exists but source changed (no lock match)", () => {
    const lock = lockWith("a", "Old text", "auto"); // different source text
    const d = diffLocale({
      sourceLocale: "en",
      targetLocale: "pt-BR",
      source: [{ key: "a", value: "Save" }],
      target: [{ key: "a", value: "Salvar" }],
      lock,
    });
    expect(d.find((e) => e.key === "a")!.state).toBe("stale");
  });

  it("marks orphan when key gone from source", () => {
    const d = diffLocale({
      sourceLocale: "en",
      targetLocale: "pt-BR",
      source: [{ key: "a", value: "Save" }],
      target: [{ key: "a", value: "Salvar" }, { key: "gone", value: "Antigo" }],
      lock: new LockStore(),
    });
    expect(d.find((e) => e.key === "gone")!.state).toBe("orphan");
  });

  it("computes coverage", () => {
    const lock = lockWith("a", "Save", "auto");
    const d = diffLocale({ sourceLocale: "en", targetLocale: "pt-BR", source: src, target: [{ key: "a", value: "X" }], lock });
    const cov = coverage("pt-BR", d);
    expect(cov.total).toBe(3);
    expect(cov.translated).toBe(1);
    expect(cov.percent).toBe(33);
  });
});
