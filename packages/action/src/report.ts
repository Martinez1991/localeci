/**
 * PR comment builder (spec §7). The comment IS the viral loop — the whole team
 * sees it — so it is designed with care. A hidden HTML marker lets us upsert a
 * single comment instead of spamming the thread.
 */
import type { TranslateReport, CheckReport } from "localeci";

export const COMMENT_MARKER = "<!-- localeci-report -->";

interface FlaggedLine {
  locale: string;
  key: string;
  score: number;
  note: string;
  failed: boolean;
}

export function buildTranslateComment(report: TranslateReport): string {
  const totalTranslated = [...report.byLocale.values()].reduce((a, l) => a + l.translated, 0);
  const totalFlagged = [...report.byLocale.values()].reduce((a, l) => a + l.flagged, 0);

  const header =
    totalTranslated > 0
      ? `## 🌍 LocaleCI — ${totalTranslated} new string${totalTranslated === 1 ? "" : "s"} translated`
      : `## 🌍 LocaleCI — everything up to date`;

  const rows = [...report.byLocale.entries()].map(([locale, a]) => {
    const avg = a.scored ? Math.round(a.scoreSum / a.scored) : "—";
    return `| ${locale} | ${a.translated} | ${avg} | ${a.flagged} |`;
  });

  const table = [
    "| Locale | Translated | Avg score | ⚠ Flagged |",
    "|---|---|---|---|",
    ...rows,
  ].join("\n");

  const flagged: FlaggedLine[] = report.perFile.flatMap((f) =>
    f.results
      .filter((r) => r.decision === "flagged" || r.decision === "failed")
      .map((r) => ({
        locale: r.locale,
        key: r.key,
        score: r.score,
        note: r.issues[0] ?? r.decision,
        failed: r.decision === "failed",
      })),
  );

  let details = "";
  if (flagged.length) {
    const lines = flagged
      .slice(0, 30)
      .map((f) => `\`${f.key}\` (${f.locale}) — score ${f.score} — ${f.note}`)
      .join("\n");
    const more = flagged.length > 30 ? `\n…and ${flagged.length - 30} more` : "";
    details = `\n<details><summary>⚠ ${flagged.length} string${flagged.length === 1 ? "" : "s"} need review</summary>\n\n${lines}${more}\n</details>\n`;
  }

  const cost = report.costUsd === 0 ? "$0" : report.costUsd < 0.01 ? "<$0.01" : `$${report.costUsd.toFixed(2)}`;
  const tokens = `\n<sub>${report.tokensIn} tokens in · ${report.tokensOut} out · est. ${cost} · ${report.changedFiles.length} file(s) changed</sub>`;

  return [
    COMMENT_MARKER,
    header,
    "",
    totalTranslated > 0 || totalFlagged > 0 ? table : "_No changes to translation files in this PR._",
    details,
    tokens,
    "\nPowered by [LocaleCI](https://localeci.dev) · [docs](https://localeci.dev/docs)",
  ].join("\n");
}

export function buildCheckComment(report: CheckReport): string {
  const broken = report.issues.filter((i) => i.kind === "broken");
  const missing = report.issues.filter((i) => i.kind === "missing");
  const below = report.issues.filter((i) => i.kind === "below-threshold");

  const status = report.ok ? "✅ passed" : "❌ found problems";
  const rows = report.coverage.map((c) => `| ${c.locale} | ${c.percent}% | ${c.missing} | ${c.stale} |`);
  const table = ["| Locale | Coverage | Missing | Stale |", "|---|---|---|---|", ...rows].join("\n");

  const problems: string[] = [];
  if (broken.length) problems.push(`- **${broken.length}** broken translation(s)`);
  if (below.length) problems.push(`- **${below.length}** below quality threshold`);
  if (missing.length) problems.push(`- **${missing.length}** not yet translated`);

  return [
    COMMENT_MARKER,
    `## 🌍 LocaleCI check — ${status}`,
    "",
    table,
    problems.length ? "\n" + problems.join("\n") : "",
    "\n<sub>This is a fork PR — LocaleCI ran read-only (no secrets, no commits).</sub>",
    "\nPowered by [LocaleCI](https://localeci.dev)",
  ].join("\n");
}
