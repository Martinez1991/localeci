import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdInit } from "./commands/init.js";
import { cmdTranslate } from "./commands/translate.js";
import { cmdCheck } from "./commands/check.js";
import { cmdDataset } from "./commands/dataset.js";
import { detectProject } from "./lib/detect.js";
import { deriveTargetPath } from "./lib/project.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "localeci-e2e-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function seedNextIntl(): void {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { "next-intl": "^3" } }));
  mkdirSync(join(dir, "messages"), { recursive: true });
  writeFileSync(
    join(dir, "messages", "en.json"),
    JSON.stringify({ nav: { home: "Home" }, cart: { items: "{count, plural, one {# item} other {# items}}" }, greet: "Hello {name}" }, null, 2) + "\n",
  );
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "Nav.tsx"), `export const N = () => <button>{t("nav.home")}</button>;`);
}

describe("deriveTargetPath", () => {
  it("maps directory-style layouts", () => {
    expect(deriveTargetPath("locales/en/common.json", "en", "pt-BR")).toBe("locales/pt-BR/common.json");
  });
  it("maps filename-style layouts", () => {
    expect(deriveTargetPath("messages/en.json", "en", "de")).toBe("messages/de.json");
  });
  it("maps Android values/ to values-<qualifier>/", () => {
    expect(deriveTargetPath("res/values/strings.xml", "en", "pt-BR", "android")).toBe("res/values-pt-rBR/strings.xml");
    expect(deriveTargetPath("res/values/strings.xml", "en", "de", "android")).toBe("res/values-de/strings.xml");
  });
  it("maps iOS .lproj layouts", () => {
    expect(deriveTargetPath("en.lproj/Localizable.strings", "en", "pt-BR", "strings")).toBe("pt-BR.lproj/Localizable.strings");
  });
});

describe("detect + init + translate + check (mock)", () => {
  it("detects next-intl", async () => {
    seedNextIntl();
    const d = await detectProject(dir);
    expect(d?.format).toBe("next-intl");
    expect(d?.sourceLocale).toBe("en");
  });

  it("init writes a valid config", async () => {
    seedNextIntl();
    const code = await cmdInit({ cwd: dir });
    expect(code).toBe(0);
    expect(existsSync(join(dir, "localeci.config.json"))).toBe(true);
  });

  it("translate --mock produces target files with preserved placeholders/ICU", async () => {
    seedNextIntl();
    await cmdInit({ cwd: dir });
    const code = await cmdTranslate({ cwd: dir, to: ["pt-BR"], mock: true, today: "2026-07-09", env: {} });
    expect(code).toBe(0);
    const out = JSON.parse(readFileSync(join(dir, "messages", "pt-BR.json"), "utf8"));
    expect(out.greet).toContain("{name}");
    expect(out.cart.items).toContain("plural");
    expect(out.cart.items).toContain("#");
    // Lock written.
    expect(existsSync(join(dir, "localeci.lock.json"))).toBe(true);
  });

  it("check passes after translating and fails when strings are missing", async () => {
    seedNextIntl();
    await cmdInit({ cwd: dir });
    // Only translate pt-BR.
    await cmdTranslate({ cwd: dir, to: ["pt-BR"], mock: true, today: "2026-07-09", env: {} });
    expect(await cmdCheck({ cwd: dir, to: ["pt-BR"] })).toBe(0);
    // es/de untranslated → strict check fails.
    expect(await cmdCheck({ cwd: dir })).toBe(1);
  });

  it("dataset exports approved translations as JSONL", async () => {
    seedNextIntl();
    await cmdInit({ cwd: dir });
    await cmdTranslate({ cwd: dir, to: ["pt-BR"], mock: true, today: "2026-07-10", env: {} });
    // Machine translations only → human dataset is empty, but --include-auto exports them.
    expect(await cmdDataset({ cwd: dir, includeAuto: true, out: "ds.jsonl", format: "plain" })).toBe(0);
    const jsonl = readFileSync(join(dir, "ds.jsonl"), "utf8").trim();
    expect(jsonl.length).toBeGreaterThan(0);
    const first = JSON.parse(jsonl.split("\n")[0]!);
    expect(first).toHaveProperty("source");
    expect(first).toHaveProperty("target");
    expect(first).toHaveProperty("locale", "pt-BR");
  });

  it("second translate is idempotent (no token spend)", async () => {
    seedNextIntl();
    await cmdInit({ cwd: dir });
    await cmdTranslate({ cwd: dir, to: ["pt-BR"], mock: true, today: "2026-07-09", env: {} });
    const before = readFileSync(join(dir, "messages", "pt-BR.json"), "utf8");
    await cmdTranslate({ cwd: dir, to: ["pt-BR"], mock: true, today: "2026-07-09", env: {} });
    const after = readFileSync(join(dir, "messages", "pt-BR.json"), "utf8");
    expect(after).toBe(before);
  });
});
