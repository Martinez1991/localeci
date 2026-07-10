/**
 * Code-context scanner (spec §5.2). A JS-only fallback grep (no ripgrep binary
 * dependency): scan the configured source globs for i18n key usages and
 * classify the surrounding element by heuristic (button/tooltip/error/...).
 *
 * grep + heuristic delivers ~90% of the value for ~10% of the effort — no AST.
 */
import { readFileSync } from "node:fs";
import { glob } from "tinyglobby";

// Match the common i18n call/attribute shapes across React, Vue, and Svelte:
//   t('key') / $t('key') / i18n.t(`key`)         (react-i18next, vue-i18n)
//   $_('key') / $format('key')                    (svelte-i18n)
//   <Trans i18nKey="key">  <i18n-t keypath="key">  v-t="'key'"
const USAGE_RES = [
  /\bt\(\s*["'`]([\w.:-]+)["'`]/g,
  /\$(?:t|tc|_|format)\(\s*["'`]([\w.:-]+)["'`]/g,
  /(?:i18nKey|keypath)\s*=\s*["'`]([\w.:-]+)["'`]/g,
  /\bv-t\s*=\s*["'`]'?([\w.:-]+)'?["'`]/g,
];

function classify(line: string): string | null {
  const l = line.toLowerCase();
  // `:?` tolerates Vue's bound attributes (:placeholder, :title, …).
  if (/<button|role=["']button|\.button|btn/.test(l)) return "button label";
  if (/:?placeholder\s*=/.test(l)) return "input placeholder";
  if (/:?aria-label\s*=/.test(l)) return "accessibility label (aria-label)";
  if (/:?title\s*=/.test(l)) return "tooltip/title";
  if (/<h[1-6]|heading/.test(l)) return "heading";
  return null;
}

export interface CodeContextOptions {
  cwd: string;
  include: string[];
  maxFiles?: number;
}

/** Returns a map of i18n key → short context summary. */
export async function scanCodeContext(opts: CodeContextOptions): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (opts.include.length === 0) return result;

  const files = await glob(opts.include, { cwd: opts.cwd, absolute: true, onlyFiles: true });
  const limited = files.slice(0, opts.maxFiles ?? 2000);

  for (const file of limited) {
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      for (const re of USAGE_RES) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) {
          const key = m[1];
          if (!key || result.has(key)) continue;
          // Prefer the key's own line; fall back to a ±2-line window so we don't
          // borrow an adjacent element's context (e.g. a neighboring <button>).
          const window = lines.slice(Math.max(0, i - 2), i + 3).join(" ");
          const kind = classify(line) ?? classify(window);
          const fileName = file.replace(/\\/g, "/").split("/").slice(-2).join("/");
          result.set(key, kind ? `${kind} (${fileName})` : `used in ${fileName}`);
        }
      }
    }
  }
  return result;
}
