import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanCodeContext } from "./codeContext.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "localeci-scan-"));
  mkdirSync(join(dir, "src"), { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("scanCodeContext — Vue & Svelte", () => {
  it("extracts Vue keys ($t, i18n-t keypath, v-t) with element context", async () => {
    writeFileSync(
      join(dir, "src", "Comp.vue"),
      `<template>
  <button>{{ $t('nav.save') }}</button>
  <input :placeholder="$t('form.email')" />
  <i18n-t keypath="hero.title" tag="h1" />
  <span v-t="'footer.copyright'"></span>
</template>`,
    );
    const ctx = await scanCodeContext({ cwd: dir, include: ["src/**/*.{vue,svelte,ts,js}"] });
    expect(ctx.has("nav.save")).toBe(true);
    expect(ctx.get("nav.save")).toContain("button");
    expect(ctx.get("form.email")).toContain("placeholder");
    expect(ctx.has("hero.title")).toBe(true);
    expect(ctx.has("footer.copyright")).toBe(true);
  });

  it("extracts Svelte svelte-i18n keys ($_ and $t)", async () => {
    writeFileSync(
      join(dir, "src", "App.svelte"),
      `<script>import { _ } from 'svelte-i18n';</script>
<button>{$_('actions.delete')}</button>
<p>{$t('messages.saved')}</p>`,
    );
    const ctx = await scanCodeContext({ cwd: dir, include: ["src/**/*.{vue,svelte,ts,js}"] });
    expect(ctx.has("actions.delete")).toBe(true);
    expect(ctx.has("messages.saved")).toBe(true);
  });
});
