/**
 * Live translation playground page. Type a string, pick a locale, and see the
 * translation with its quality score and any validator/judge issues. Reference
 * implementation — a client component that posts to /api/v1/playground.
 */
"use client";
import { useState } from "react";

const LOCALES = ["pt-BR", "es", "de", "fr", "ja", "pl", "zh"];

interface Result {
  translation: string;
  score: number;
  decision: string;
  issues: string[];
  tier: string;
}

export default function PlaygroundPage() {
  const [source, setSource] = useState("Save changes");
  const [target, setTarget] = useState("pt-BR");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/playground", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, sourceLocale: "en", targetLocale: target }),
      });
      setResult(await res.json());
    } finally {
      setLoading(false);
    }
  }

  const color = result ? (result.score >= 90 ? "#16a34a" : result.score >= 75 ? "#d97706" : "#dc2626") : "#111";

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 640, margin: "0 auto", padding: 40 }}>
      <h1>Translation playground</h1>
      <p style={{ color: "#666" }}>Try LocaleCI&apos;s quality pipeline on any string — validated and scored, live.</p>

      <textarea
        value={source}
        onChange={(e) => setSource(e.target.value)}
        rows={3}
        style={{ width: "100%", padding: 10, fontSize: 16 }}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <span>en →</span>
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button onClick={run} disabled={loading}>
          {loading ? "Translating…" : "Translate"}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 24, border: `2px solid ${color}`, borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 20 }}>{result.translation}</div>
          <div style={{ marginTop: 8, color }}>
            score {result.score} · {result.decision} · {result.tier} model
          </div>
          {result.issues.length > 0 && (
            <ul style={{ marginTop: 8, color: "#dc2626" }}>
              {result.issues.map((i, n) => (
                <li key={n}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
