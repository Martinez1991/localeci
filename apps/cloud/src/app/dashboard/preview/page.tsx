/**
 * Visual UI preview page (Scale tier). Renders sample UI components filled with
 * translated strings and highlights where a translation overflows its element.
 * Reference implementation — a real version reads the org's latest translations.
 */
import { previewStrings, type PreviewItem, type FitStatus } from "../../../lib/preview.js";

// Demo data; the real page pulls from the org's translated strings.
const DEMO: Record<string, PreviewItem[]> = {
  de: [
    { key: "nav.home", source: "Home", target: "Startseite", kind: "nav" },
    { key: "btn.save", source: "Save", target: "Speichern", kind: "button" },
    { key: "btn.settings", source: "Settings", target: "Benutzereinstellungen verwalten", kind: "button" },
    { key: "hero.title", source: "Ship faster", target: "Schneller ausliefern", kind: "title" },
  ],
};

const COLOR: Record<FitStatus, string> = { fits: "#16a34a", tight: "#d97706", overflow: "#dc2626" };

export default function PreviewPage() {
  const locale = "de";
  const summary = previewStrings(locale, DEMO[locale]!);

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 720, margin: "0 auto", padding: 40 }}>
      <h1>Visual preview — {locale}</h1>
      <p>
        {summary.fits} fit · <span style={{ color: COLOR.tight }}>{summary.tight} tight</span> ·{" "}
        <span style={{ color: COLOR.overflow }}>{summary.overflow} overflow</span>
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
        {summary.items.map((r) => (
          <div key={r.key} style={{ border: `2px solid ${COLOR[r.status]}`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, color: "#666", display: "flex", justifyContent: "space-between" }}>
              <span>{r.key} · {r.kind}</span>
              <span style={{ color: COLOR[r.status] }}>{r.status.toUpperCase()} · {r.targetLen}/{r.budget}</span>
            </div>
            <div
              style={{
                marginTop: 6,
                padding: r.kind === "button" ? "8px 14px" : "4px 0",
                display: r.kind === "button" || r.kind === "nav" ? "inline-block" : "block",
                background: r.kind === "button" ? "#111" : "transparent",
                color: r.kind === "button" ? "#fff" : "#111",
                borderRadius: 6,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: r.kind === "button" ? 180 : r.kind === "nav" ? 120 : "100%",
              }}
            >
              {r.target}
            </div>
            {r.note && <div style={{ fontSize: 12, color: COLOR[r.status], marginTop: 4 }}>{r.note}</div>}
          </div>
        ))}
      </div>
    </main>
  );
}
