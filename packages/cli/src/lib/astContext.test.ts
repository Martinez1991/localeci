import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tryScanAst } from "./astContext.js";
import { scanContext } from "./codeContext.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "localeci-ast-"));
  mkdirSync(join(dir, "src"), { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("tryScanAst", () => {
  it("classifies by the real enclosing JSX element, even across lines", async () => {
    writeFileSync(
      join(dir, "src", "Comp.tsx"),
      `import { useTranslation } from 'react-i18next';
export function Comp() {
  const { t } = useTranslation();
  return (
    <div>
      <button onClick={() => save()}>
        {t('actions.save')}
      </button>
      <input placeholder={t('form.email')} />
      <Trans i18nKey="hero.title" />
      <h1>{t('page.heading')}</h1>
    </div>
  );
}`,
    );
    const ctx = await tryScanAst({ cwd: dir, include: ["src/**/*.{tsx,ts,jsx,js}"] });
    expect(ctx).not.toBeNull();
    expect(ctx!.get("actions.save")).toContain("button label"); // multi-line call, still button
    expect(ctx!.get("form.email")).toContain("placeholder");
    expect(ctx!.get("hero.title")).toBeTruthy();
    expect(ctx!.get("page.heading")).toContain("heading");
  });

  it("handles i18n.t member calls and TS type annotations", async () => {
    writeFileSync(
      join(dir, "src", "svc.ts"),
      `import i18n from './i18n';
const label: string = i18n.t('nav.home');
export const msg = (): string => i18n.t('messages.saved');`,
    );
    const ctx = await tryScanAst({ cwd: dir, include: ["src/**/*.ts"] });
    expect(ctx!.has("nav.home")).toBe(true);
    expect(ctx!.has("messages.saved")).toBe(true);
  });
});

describe("scanContext (AST + grep merge)", () => {
  it("prefers AST context and falls back to grep for .vue", async () => {
    writeFileSync(join(dir, "src", "A.tsx"), `const x = <button>{t('a.save')}</button>;`);
    writeFileSync(join(dir, "src", "B.vue"), `<template><span>{{ $t('b.hi') }}</span></template>`);
    const ctx = await scanContext({ cwd: dir, include: ["src/**/*.{tsx,vue}"] });
    expect(ctx.get("a.save")).toContain("button label"); // from AST
    expect(ctx.has("b.hi")).toBe(true); // from grep (.vue)
  });
});
