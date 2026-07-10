import { describe, it, expect } from "vitest";
import { LockStore, lockHash, emptyLockfile } from "./lockfile.js";
import type { LockEntry } from "./types.js";

const entry = (over: Partial<LockEntry> = {}): LockEntry => ({
  source: "Save",
  target: "Salvar",
  locale: "pt-BR",
  score: 98,
  model: "mock/1",
  approvedBy: "auto",
  translatedAt: "2026-07-08",
  ...over,
});

describe("lockfile", () => {
  it("hash is deterministic and sensitive to inputs", () => {
    const base = { sourceLocale: "en", key: "a", sourceText: "Save", targetLocale: "pt-BR" };
    expect(lockHash(base)).toBe(lockHash(base));
    expect(lockHash(base)).not.toBe(lockHash({ ...base, sourceText: "Saved" }));
  });

  it("does not overwrite a human entry with an auto entry", () => {
    const store = new LockStore(emptyLockfile());
    store.set("h", entry({ approvedBy: "human", target: "Guardar" }));
    store.set("h", entry({ approvedBy: "auto", target: "Salvar" }));
    expect(store.get("h")!.target).toBe("Guardar");
  });

  it("allows a human entry to overwrite an auto entry", () => {
    const store = new LockStore(emptyLockfile());
    store.set("h", entry({ approvedBy: "auto", target: "Salvar" }));
    store.set("h", entry({ approvedBy: "human", target: "Guardar" }));
    expect(store.get("h")!.target).toBe("Guardar");
  });

  it("serializes with sorted keys and trailing newline", () => {
    const store = new LockStore(emptyLockfile());
    store.set("b", entry());
    store.set("a", entry());
    const out = store.serialize();
    expect(out.endsWith("\n")).toBe(true);
    expect(out.indexOf('"a"')).toBeLessThan(out.indexOf('"b"'));
    // round-trips
    expect(LockStore.from(out).get("a")).toBeTruthy();
  });
});
