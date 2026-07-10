/**
 * AST-based code-context scanner (spec §13 trigger: real AST over grep).
 *
 * Uses the TypeScript compiler to parse JS/TS/JSX/TSX and locate i18n call sites
 * precisely — it knows the exact enclosing JSX element and attribute, so a
 * `t('key')` inside `<button>` is classified as a button label even when the
 * call spans lines or nests deep. TypeScript is imported dynamically; if it
 * isn't installed the caller falls back to the grep scanner.
 */
import { readFileSync } from "node:fs";
import { glob } from "tinyglobby";

const CALL_NAMES = new Set(["t", "$t", "$tc", "$_", "$format"]);
const KEY_ATTRS = new Set(["i18nKey", "keypath"]);
const AST_EXT = /\.(tsx|ts|jsx|js|mjs|cjs)$/;

interface Ctx {
  jsxTag?: string;
  attrName?: string;
  file: string;
}

function classify(ctx: Ctx): string {
  const attr = ctx.attrName?.toLowerCase();
  if (attr === "placeholder") return `input placeholder (${ctx.file})`;
  if (attr === "aria-label") return `accessibility label (${ctx.file})`;
  if (attr === "title") return `tooltip/title (${ctx.file})`;
  const tag = ctx.jsxTag?.toLowerCase();
  if (tag && /^button$/.test(tag)) return `button label (${ctx.file})`;
  if (tag && /^h[1-6]$/.test(tag)) return `heading (${ctx.file})`;
  if (tag) return `<${ctx.jsxTag}> content (${ctx.file})`;
  return `used in ${ctx.file}`;
}

export interface AstScanOptions {
  cwd: string;
  include: string[];
  maxFiles?: number;
}

/** Returns key→context, or null if TypeScript is unavailable (→ grep fallback). */
export async function tryScanAst(opts: AstScanOptions): Promise<Map<string, string> | null> {
  let ts: typeof import("typescript");
  try {
    ts = (await import("typescript")).default ?? (await import("typescript"));
  } catch {
    return null;
  }
  if (!ts?.createSourceFile) return null;

  const result = new Map<string, string>();
  const all = await glob(opts.include, { cwd: opts.cwd, absolute: true, onlyFiles: true });
  const files = all.filter((f) => AST_EXT.test(f)).slice(0, opts.maxFiles ?? 2000);

  const scriptKind = (file: string): number => {
    if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
    if (file.endsWith(".ts")) return ts.ScriptKind.TS;
    if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
    return ts.ScriptKind.JS;
  };

  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const short = file.replace(/\\/g, "/").split("/").slice(-2).join("/");
    let sf: import("typescript").SourceFile;
    try {
      sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
    } catch {
      continue;
    }

    const record = (key: string, ctx: Ctx): void => {
      if (key && !result.has(key)) result.set(key, classify(ctx));
    };

    const stringArg = (node: import("typescript").Node): string | null => {
      if (ts.isStringLiteralLike(node)) return node.text;
      return null;
    };

    const visit = (node: import("typescript").Node, ctx: Ctx): void => {
      let next = ctx;
      if (ts.isJsxElement(node)) next = { ...ctx, jsxTag: node.openingElement.tagName.getText(sf), attrName: undefined };
      else if (ts.isJsxSelfClosingElement(node)) next = { ...ctx, jsxTag: node.tagName.getText(sf), attrName: undefined };
      else if (ts.isJsxAttribute(node)) next = { ...ctx, attrName: node.name.getText(sf) };

      // t('key') / $t('key') / i18n.t('key')
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const name = ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : ts.isIdentifier(callee)
            ? callee.text
            : "";
        if (CALL_NAMES.has(name) && node.arguments[0]) {
          const key = stringArg(node.arguments[0]);
          if (key) record(key, next);
        }
      }

      // <Trans i18nKey="key"> / <i18n-t keypath="key">
      if (ts.isJsxAttribute(node) && KEY_ATTRS.has(node.name.getText(sf)) && node.initializer) {
        const init = node.initializer;
        const lit = ts.isStringLiteral(init)
          ? init.text
          : ts.isJsxExpression(init) && init.expression
            ? stringArg(init.expression)
            : null;
        if (lit) record(lit, next);
      }

      ts.forEachChild(node, (c) => visit(c, next));
    };

    visit(sf, { file: short });
  }

  return result;
}
