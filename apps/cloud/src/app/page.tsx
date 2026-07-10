/** Landing page (copy from the launch kit, part 4). Reference implementation. */
import { PLANS } from "../lib/plans.js";

export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 860, margin: "0 auto", padding: "48px 24px", lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 40, lineHeight: 1.1 }}>Ship your app in 30 languages. Without leaving Git.</h1>
      <p style={{ fontSize: 20, color: "#444" }}>
        LocaleCI translates your i18n files with LLMs on every commit — with a per-string quality score you can
        actually audit. Open-source CLI, flat pricing, 10 minutes to set up.
      </p>
      <p>
        <a href="/dashboard">Start free — no card</a> · <a href="https://github.com/localeci/localeci">Star on GitHub ★</a>
      </p>

      <pre style={{ background: "#0b0b0b", color: "#eee", padding: 16, borderRadius: 8, overflowX: "auto" }}>
{`$ npx localeci translate --to pt-BR,de,ja
✔ 214 strings translated · avg quality 96 · 3 flagged for review
✔ Opened PR #142 → review translations like you review code`}
      </pre>

      <h2>&quot;Can I trust AI translation?&quot; — Sometimes. And you should see when.</h2>
      <p>
        Every string passes deterministic validation (ICU plurals, placeholders, HTML), then gets judged against a
        per-language rubric. The result is a 0–100 score per string. High scores merge automatically. Low scores wait
        for a human. That&apos;s the whole product.
      </p>

      <h2>Pricing</h2>
      <ul>
        {Object.values(PLANS).map((p) => (
          <li key={p.id}>
            <strong>{p.name}</strong> — {p.priceUsd === 0 ? "Free" : `$${p.priceUsd}/mo`} · {p.stringsPerMonth.toLocaleString()} strings ·{" "}
            {p.maxLocales} locales
          </li>
        ))}
      </ul>
      <p style={{ color: "#666" }}>
        Bring your own LLM key with the open-source CLI — free forever, runs on your infra.
      </p>
    </main>
  );
}
