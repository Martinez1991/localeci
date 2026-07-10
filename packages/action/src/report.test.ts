import { describe, it, expect } from "vitest";
import { buildTranslateComment, buildCheckComment, COMMENT_MARKER } from "./report.js";
import { upsertComment } from "./github.js";
import type { TranslateReport, CheckReport } from "localeci";

function makeReport(): TranslateReport {
  const byLocale = new Map([
    ["pt-BR", { translated: 12, flagged: 0, failed: 0, scoreSum: 96 * 12, scored: 12 }],
    ["ja", { translated: 12, flagged: 2, failed: 0, scoreSum: 88 * 12, scored: 12 }],
  ]);
  return {
    perFile: [
      {
        file: "messages/en.json",
        targetPath: "messages/ja.json",
        locale: "ja",
        results: [
          { key: "onboarding.tagline", locale: "ja", source: "Blast your growth", target: "…", score: 71, decision: "flagged", tier: "top", issues: ['idiom "blast" may read literally'] },
        ],
        translatedCount: 12,
        flaggedCount: 1,
        failedCount: 0,
        avgScore: 88,
        changed: true,
      },
    ],
    byLocale,
    tokensIn: 500,
    tokensOut: 480,
    hasFailures: false,
    changedFiles: ["messages/pt-BR.json", "messages/ja.json"],
  };
}

describe("buildTranslateComment", () => {
  it("includes the marker, header, table and flagged details", () => {
    const md = buildTranslateComment(makeReport());
    expect(md).toContain(COMMENT_MARKER);
    expect(md).toContain("24 new strings translated");
    expect(md).toContain("| pt-BR | 12 | 96 | 0 |");
    expect(md).toContain("| ja | 12 | 88 | 2 |");
    expect(md).toContain("onboarding.tagline");
    expect(md).toContain("Powered by [LocaleCI]");
  });
});

describe("buildCheckComment", () => {
  it("summarizes coverage and problems", () => {
    const report: CheckReport = {
      coverage: [{ locale: "de", total: 10, translated: 8, missing: 2, stale: 0, orphan: 0, percent: 80 }],
      issues: [{ file: "x", locale: "de", key: "a", kind: "missing", message: "not translated" }],
      ok: false,
    };
    const md = buildCheckComment(report);
    expect(md).toContain("found problems");
    expect(md).toContain("| de | 80% | 2 | 0 |");
    expect(md).toContain("not yet translated");
  });
});

describe("upsertComment", () => {
  it("PATCHes an existing marked comment", async () => {
    const calls: Array<{ method: string; url: string }> = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET", url: String(url) });
      if ((init?.method ?? "GET") === "GET") {
        return new Response(JSON.stringify([{ id: 42, body: `hello ${COMMENT_MARKER}` }]), { status: 200 });
      }
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    await upsertComment(
      { token: "t", apiUrl: "https://api.github.com", owner: "o", repo: "r", prNumber: 7, fetchImpl: fakeFetch },
      COMMENT_MARKER,
      "new body",
    );
    expect(calls.some((c) => c.method === "PATCH" && c.url.includes("/comments/42"))).toBe(true);
  });

  it("POSTs a new comment when none exists", async () => {
    const calls: Array<{ method: string; url: string }> = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET", url: String(url) });
      if ((init?.method ?? "GET") === "GET") return new Response(JSON.stringify([]), { status: 200 });
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    await upsertComment(
      { token: "t", apiUrl: "https://api.github.com", owner: "o", repo: "r", prNumber: 7, fetchImpl: fakeFetch },
      COMMENT_MARKER,
      "new body",
    );
    expect(calls.some((c) => c.method === "POST" && c.url.includes("/issues/7/comments"))).toBe(true);
  });
});
