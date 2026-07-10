import { describe, it, expect } from "vitest";
import {
  runLocale,
  LockStore,
  lockHash,
  parseConfig,
  buildTranslatePrompt,
  type FlatEntry,
  type Provider,
} from "@localeci/core";
import { createMockProvider } from "./mock.js";

const config = parseConfig({
  source: { locale: "en", files: "x", format: "i18next" },
  targets: ["pt-BR"],
  provider: { name: "mock" },
  quality: { threshold: 70, onBelowThreshold: "flag" },
});

const source: FlatEntry[] = [
  { key: "cart.checkout", value: "Checkout" },
  { key: "cart.total", value: "Total" },
];

function seededLock(): LockStore {
  const lock = new LockStore();
  // cart.checkout was previously auto-translated to "Chèckòùt".
  lock.set(lockHash({ sourceLocale: "en", key: "cart.checkout", sourceText: "Checkout", targetLocale: "pt-BR" }), {
    source: "Checkout",
    target: "Chèckòùt",
    locale: "pt-BR",
    score: 96,
    model: "mock",
    approvedBy: "auto",
    translatedAt: "2026-07-01",
  });
  return lock;
}

describe("human learning loop (§5.7)", () => {
  it("re-locks a human-edited string as approvedBy: human", async () => {
    const lock = seededLock();
    // A human edited the on-disk target from "Chèckòùt" → "Finalizar compra".
    const target: FlatEntry[] = [{ key: "cart.checkout", value: "Finalizar compra" }];

    await runLocale({
      sourceLocale: "en", targetLocale: "pt-BR", source, target, lock,
      provider: createMockProvider(), config, glossary: [], today: "2026-07-09",
    });

    const entry = lock.lookup({ sourceLocale: "en", key: "cart.checkout", sourceText: "Checkout", targetLocale: "pt-BR" });
    expect(entry?.approvedBy).toBe("human");
    expect(entry?.target).toBe("Finalizar compra");
  });

  it("passes the human example as few-shot when translating a sibling string", async () => {
    const lock = seededLock();
    const target: FlatEntry[] = [{ key: "cart.checkout", value: "Finalizar compra" }];

    // Capture what the provider receives.
    let captured: Parameters<Provider["translate"]>[0] | null = null;
    const spy: Provider = {
      name: "spy",
      async translate(batch) {
        captured = batch;
        return createMockProvider().translate(batch);
      },
      judge: (b) => createMockProvider().judge(b),
    };

    await runLocale({
      sourceLocale: "en", targetLocale: "pt-BR", source, target, lock,
      provider: spy, config, glossary: [], today: "2026-07-09",
    });

    // cart.total is missing → translated, and should carry the human example from cart.*
    const totalItem = captured!.items.find((i) => i.id === "cart.total");
    expect(totalItem?.examples?.[0]).toEqual({ source: "Checkout", target: "Finalizar compra" });

    // And the prompt includes it.
    const prompt = buildTranslatePrompt(captured!);
    expect(prompt.user).toContain("approvedExamples");
    expect(prompt.user).toContain("Finalizar compra");
  });
});
