/** Pretty terminal output helpers. */
import pc from "picocolors";

export const log = {
  info: (msg: string) => console.log(msg),
  step: (msg: string) => console.log(`${pc.cyan("›")} ${msg}`),
  success: (msg: string) => console.log(`${pc.green("✔")} ${msg}`),
  warn: (msg: string) => console.log(`${pc.yellow("⚠")} ${msg}`),
  error: (msg: string) => console.error(`${pc.red("✘")} ${msg}`),
  dim: (msg: string) => console.log(pc.dim(msg)),
};

export const c = pc;

/** Render a simple aligned table. */
export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const fmtRow = (cells: string[]) => cells.map((cell, i) => (cell ?? "").padEnd(widths[i]!)).join("  ");
  const sep = widths.map((w) => "─".repeat(w)).join("  ");
  return [pc.bold(fmtRow(headers)), pc.dim(sep), ...rows.map(fmtRow)].join("\n");
}

/** Color a 0–100 quality score. */
export function scoreColor(score: number): string {
  if (score >= 90) return pc.green(String(score));
  if (score >= 75) return pc.yellow(String(score));
  return pc.red(String(score));
}
