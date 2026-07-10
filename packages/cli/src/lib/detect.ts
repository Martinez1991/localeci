/**
 * Auto-detection for `localeci init` (spec §2). Heuristics in order: which i18n
 * lib is in package.json → which locale folder exists → which file format →
 * which locale looks like the source (most complete). Produces a filled config
 * needing only confirmation.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { glob } from "tinyglobby";
import { formatFromExtension, type FormatId } from "@localeci/core";

export interface Detection {
  format: FormatId;
  sourceLocale: string;
  filesGlob: string;
  targetsGuess: string[];
  lib: string | null;
  layout: "dir" | "file";
  scanInclude: string[];
}

const LOCALE_DIRS = ["locales", "i18n", "lang", "messages", "src/locales", "public/locales", "app/locales"];
const COMMON_LOCALES = ["en", "en-US", "en-GB"];

function detectLib(cwd: string): string | null {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["next-intl"]) return "next-intl";
    if (deps["react-i18next"] || deps["i18next"]) return "i18next";
    if (deps["vue-i18n"]) return "vue-i18n";
  } catch {
    /* ignore */
  }
  return null;
}

function isLocaleName(name: string): boolean {
  return /^[a-z]{2}(?:[-_][A-Za-z]{2,4})?$/.test(name);
}

/** Count translatable strings in a file, best-effort by format. */
function roughStringCount(path: string): number {
  try {
    const raw = readFileSync(path, "utf8");
    if (path.endsWith(".json")) {
      const obj = JSON.parse(raw);
      let n = 0;
      const walk = (v: unknown): void => {
        if (typeof v === "string") n++;
        else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") Object.values(v).forEach(walk);
      };
      walk(obj);
      return n;
    }
    return raw.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#")).length;
  } catch {
    return 0;
  }
}

export async function detectProject(cwd: string): Promise<Detection | null> {
  const lib = detectLib(cwd);

  // Find a locale directory.
  let baseDir: string | null = null;
  for (const d of LOCALE_DIRS) {
    if (existsSync(join(cwd, d)) && statSync(join(cwd, d)).isDirectory()) {
      baseDir = d;
      break;
    }
  }
  if (!baseDir) return null;

  const entries = readdirSync(join(cwd, baseDir));
  const localeSubdirs = entries.filter((e) => {
    const p = join(cwd, baseDir!, e);
    return statSync(p).isDirectory() && isLocaleName(e);
  });

  let layout: "dir" | "file";
  let localeCandidates: string[];
  let format: FormatId;

  if (localeSubdirs.length > 0) {
    layout = "dir";
    localeCandidates = localeSubdirs;
    // Format from a sample file.
    const sample = (await glob(`${baseDir}/${localeSubdirs[0]}/**/*.{json,yaml,yml,po,strings,xml,ftl}`, { cwd, onlyFiles: true }))[0];
    format = (sample && formatFromExtension(sample)) || "json";
  } else {
    layout = "file";
    const files = entries.filter((e) => /\.(json|ya?ml|po|strings|xml|ftl)$/.test(e));
    localeCandidates = files.map((f) => f.replace(/\.(json|ya?ml|po)$/, "")).filter(isLocaleName);
    format = (files[0] && formatFromExtension(files[0])) || "json";
    if (localeCandidates.length === 0) return null;
  }

  // Source locale: prefer an English variant, else the one with the most strings.
  let sourceLocale = COMMON_LOCALES.find((l) => localeCandidates.includes(l)) ?? "";
  if (!sourceLocale) {
    let best = localeCandidates[0]!;
    let bestCount = -1;
    for (const loc of localeCandidates) {
      const pattern = layout === "dir" ? `${baseDir}/${loc}/**/*.*` : `${baseDir}/${loc}.*`;
      const files = await glob(pattern, { cwd, onlyFiles: true });
      const count = files.reduce((a, f) => a + roughStringCount(join(cwd, f)), 0);
      if (count > bestCount) {
        bestCount = count;
        best = loc;
      }
    }
    sourceLocale = best;
  }

  const filesGlob =
    layout === "dir"
      ? `${baseDir}/${sourceLocale}/**/*.${extFor(format)}`
      : `${baseDir}/${sourceLocale}.${extFor(format)}`;

  const targetsGuess = localeCandidates.filter((l) => l !== sourceLocale);

  // Map i18next/next-intl lib to the specific format id.
  if (format === "json" && lib === "next-intl") format = "next-intl";
  if (format === "json" && lib === "i18next") format = "i18next";

  const scanInclude = existsSync(join(cwd, "src")) ? ["src/**/*.{tsx,jsx,ts,js}"] : ["**/*.{tsx,jsx,ts,js}"];

  return {
    format,
    sourceLocale,
    filesGlob,
    targetsGuess: targetsGuess.length ? targetsGuess : ["pt-BR", "es", "de"],
    lib,
    layout,
    scanInclude,
  };
}

function extFor(format: FormatId): string {
  if (format === "yaml") return "yml";
  if (format === "po") return "po";
  if (format === "strings") return "strings";
  if (format === "android") return "xml";
  if (format === "fluent") return "ftl";
  return "json";
}
