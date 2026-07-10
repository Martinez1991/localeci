import { describe, it, expect } from "vitest";
import { buildFineTuneDataset, buildOpenAIExample, fineTuneReadiness, type FineTunePair } from "./finetune.js";

const pairs: FineTunePair[] = [
  { source: "Save changes", target: "Salvar alterações", locale: "pt-BR" },
  { source: "Cancel", target: "Abbrechen", locale: "de" },
  { source: "Delete", target: "Excluir", locale: "pt-BR" },
];

describe("fine-tune dataset", () => {
  it("builds OpenAI chat JSONL mirroring the production prompt", () => {
    const ex = buildOpenAIExample(pairs[0]!, "en");
    expect(ex.messages).toHaveLength(3);
    expect(ex.messages[0]!.role).toBe("system");
    expect(ex.messages[0]!.content).toContain("expert software UI localizer");
    expect(ex.messages[1]!.content).toContain("Save changes");
    expect(JSON.parse(ex.messages[2]!.content).translations[0].text).toBe("Salvar alterações");
  });

  it("emits one JSONL line per pair (openai)", () => {
    const out = buildFineTuneDataset(pairs, { format: "openai", sourceLocale: "en" });
    const lines = out.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(() => lines.map((l) => JSON.parse(l))).not.toThrow();
  });

  it("emits plain source/target/locale JSONL", () => {
    const out = buildFineTuneDataset(pairs, { format: "plain", sourceLocale: "en" });
    expect(JSON.parse(out.trim().split("\n")[0]!)).toEqual({ source: "Save changes", target: "Salvar alterações", locale: "pt-BR" });
  });

  it("empty input → empty string", () => {
    expect(buildFineTuneDataset([], { format: "openai", sourceLocale: "en" })).toBe("");
  });
});

describe("fineTuneReadiness", () => {
  it("reports per-locale counts and the gap to threshold", () => {
    const r = fineTuneReadiness(pairs, 100);
    expect(r.ready).toBe(false);
    expect(r.count).toBe(3);
    expect(r.needed).toBe(97);
    expect(r.byLocale["pt-BR"]).toBe(2);
    expect(r.byLocale["de"]).toBe(1);
  });
  it("is ready at/over the threshold", () => {
    expect(fineTuneReadiness(pairs, 3).ready).toBe(true);
  });
});
