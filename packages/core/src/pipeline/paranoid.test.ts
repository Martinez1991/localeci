import { describe, it, expect } from "vitest";
import { tokenSimilarity, cosineSimilarity, hashingVector } from "./similarity.js";
import { decide } from "./score.js";

describe("cosineSimilarity + hashingVector", () => {
  it("cosine is 1 for identical vectors, 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 0, 1], [1, 0, 1])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });
  it("hashingVector is deterministic and diacritic-insensitive", () => {
    expect(hashingVector("Save changes")).toEqual(hashingVector("Save changes"));
    // Same tokens ignoring accents → identical vectors → cosine 1.
    expect(cosineSimilarity(hashingVector("Olá mundo"), hashingVector("Ola mundo"))).toBeCloseTo(1, 6);
  });
  it("hashingVector cosine is lower for unrelated text", () => {
    const s = cosineSimilarity(hashingVector("save your changes now"), hashingVector("delete everything forever"));
    expect(s).toBeLessThan(0.5);
  });
});

describe("tokenSimilarity", () => {
  it("is 1 for identical text and ignores placeholders/case/diacritics", () => {
    expect(tokenSimilarity("Save changes", "save changes")).toBe(1);
    expect(tokenSimilarity("Hello {name}", "hello {other}")).toBe(1); // placeholders stripped
    expect(tokenSimilarity("Olá", "ola")).toBe(1);
  });

  it("is low for unrelated text", () => {
    expect(tokenSimilarity("Save your changes now", "Delete everything forever")).toBeLessThan(0.2);
  });

  it("is partial for overlapping text", () => {
    const s = tokenSimilarity("Your card was declined", "Your card was accepted");
    expect(s).toBeGreaterThan(0.4);
    expect(s).toBeLessThan(0.9);
  });
});

describe("decide with back-translation", () => {
  const ok = { ok: true, issues: [] };
  const judge = { id: "x", accuracy: 5, fluency: 5, terminology: 5, uiFitness: 5, issues: [] };

  it("a faithful round-trip barely moves the score", () => {
    const d = decide({ validation: ok, judge, threshold: 85, onBelowThreshold: "flag", backSimilarity: 1 });
    expect(d.score).toBe(100);
  });

  it("a divergent round-trip pulls the score down", () => {
    const d = decide({ validation: ok, judge, threshold: 85, onBelowThreshold: "flag", backSimilarity: 0 });
    expect(d.score).toBe(65);
    expect(d.decision).toBe("flagged"); // below threshold → flagged (onBelowThreshold=flag)
  });

  it("no back-translation → unchanged", () => {
    const d = decide({ validation: ok, judge, threshold: 85, onBelowThreshold: "flag" });
    expect(d.score).toBe(100);
  });
});
