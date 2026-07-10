/**
 * Project I/O: locate and load config, glossary, and locale files relative to a
 * working directory. Kept separate from the pure engine so the engine stays
 * filesystem-free.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { glob } from "tinyglobby";
import {
  parseConfig,
  parseGlossary,
  type Config,
  type Glossary,
  type FormatId,
  ConfigError,
} from "@localeci/core";

export const CONFIG_FILENAMES = ["localeci.config.json", "localeci.config.jsonc"];
export const LOCK_FILENAME = "localeci.lock.json";

export function findConfigPath(cwd: string): string | null {
  for (const name of CONFIG_FILENAMES) {
    const p = join(cwd, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Strip // and /* *\/ comments so config.jsonc parses as JSON. */
function stripJsonComments(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function loadConfig(cwd: string): { config: Config; path: string } {
  const path = findConfigPath(cwd);
  if (!path) {
    throw new ConfigError(
      `No config found. Run \`localeci init\` first (looked for ${CONFIG_FILENAMES.join(", ")} in ${cwd}).`,
    );
  }
  // Only strip comments for .jsonc; plain .json must be parsed verbatim so glob
  // patterns like "src/**/*.tsx" (which contain "/**/") are never corrupted.
  const text = readFileSync(path, "utf8");
  const raw = path.endsWith(".jsonc") ? stripJsonComments(text) : text;
  const config = parseConfig(JSON.parse(raw));
  return { config, path };
}

export function loadGlossary(cwd: string, config: Config): Glossary {
  if (!config.glossary) return { terms: [] };
  const p = resolve(cwd, config.glossary);
  if (!existsSync(p)) return { terms: [] };
  return parseGlossary(JSON.parse(readFileSync(p, "utf8")));
}

export function loadLock(cwd: string): string {
  const p = join(cwd, LOCK_FILENAME);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

export function saveLock(cwd: string, serialized: string): void {
  writeFileSync(join(cwd, LOCK_FILENAME), serialized, "utf8");
}

export async function resolveSourceFiles(cwd: string, pattern: string): Promise<string[]> {
  const files = await glob(pattern, { cwd, absolute: false, onlyFiles: true });
  return files.sort();
}

/** Convert a BCP-47 locale to Android's resource qualifier (pt-BR → pt-rBR). */
function androidQualifier(locale: string): string {
  const [lang, region] = locale.split(/[-_]/);
  return region ? `${lang}-r${region.toUpperCase()}` : lang!;
}

/**
 * Map a source file path to its target-locale counterpart by substituting the
 * locale token. Handles directory-style (locales/en/x.json), filename-style
 * (locales/en.json), Android (res/values/ → res/values-pt-rBR/), and iOS
 * (en.lproj/ → pt-BR.lproj/) layouts.
 */
export function deriveTargetPath(
  sourcePath: string,
  sourceLocale: string,
  targetLocale: string,
  format?: FormatId,
): string {
  const norm = sourcePath.replace(/\\/g, "/");

  // Android: res/values/ or res/values-en/ → res/values-<qualifier>/
  if (format === "android") {
    const q = androidQualifier(targetLocale);
    const srcQ = androidQualifier(sourceLocale);
    if (new RegExp(`(^|/)values-${escapeRe(srcQ)}(/)`).test(norm)) {
      return norm.replace(new RegExp(`(^|/)values-${escapeRe(srcQ)}(/)`), `$1values-${q}$2`);
    }
    if (/(^|\/)values(\/)/.test(norm)) {
      return norm.replace(/(^|\/)values(\/)/, `$1values-${q}$2`);
    }
  }

  // iOS: en.lproj/ → pt-BR.lproj/
  const lprojRe = new RegExp(`(^|/)${escapeRe(sourceLocale)}\\.lproj(/)`);
  if (lprojRe.test(norm)) return norm.replace(lprojRe, `$1${targetLocale}.lproj$2`);

  // Directory segment: /en/ → /pt-BR/
  const dirRe = new RegExp(`(^|/)${escapeRe(sourceLocale)}(/)`);
  if (dirRe.test(norm)) return norm.replace(dirRe, `$1${targetLocale}$2`);
  // Filename stem: /en.json → /pt-BR.json
  const fileRe = new RegExp(`(^|/)${escapeRe(sourceLocale)}(\\.[^/.]+)$`);
  if (fileRe.test(norm)) return norm.replace(fileRe, `$1${targetLocale}$2`);
  // Fallback: insert locale before extension.
  return norm.replace(/(\.[^/.]+)$/, `.${targetLocale}$1`);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function readFileIfExists(cwd: string, relPath: string): string {
  const p = resolve(cwd, relPath);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

export function writeFileEnsuringDir(cwd: string, relPath: string, content: string): void {
  const p = resolve(cwd, relPath);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content, "utf8");
}

export function toRel(cwd: string, absPath: string): string {
  return relative(cwd, absPath).replace(/\\/g, "/");
}
