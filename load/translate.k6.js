/**
 * k6 load test for the metered translate proxy (issue #18).
 *
 * Exercises the hot TM cache: repeated strings should be served from cache
 * (fast, $0), so p95 stays low even at high RPS. Needs a valid API key.
 *   BASE_URL=https://localeci.dev API_KEY=lcx_live_... k6 run load/translate.k6.js
 */
import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    steady: { executor: "constant-vus", vus: 50, duration: "2m" },
  },
  thresholds: {
    http_req_duration: ["p(95)<1200", "p(99)<2500"],
    http_req_failed: ["rate<0.02"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const API_KEY = __ENV.API_KEY || "";

// A small, repeating string pool → high cache-hit ratio.
const POOL = ["Save", "Cancel", "Delete", "Settings", "Log out", "Search"];

export default function () {
  const text = POOL[Math.floor(Math.random() * POOL.length)];
  const res = http.post(
    `${BASE_URL}/api/v1/translate`,
    JSON.stringify({
      sourceLocale: "en",
      targetLocale: "de",
      tier: "cheap",
      items: [{ id: "1", text }],
      style: { tone: "professional", audience: "SaaS", notes: "" },
      glossary: [],
    }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` } },
  );
  check(res, { "status ok/limited": (r) => [200, 402, 429].includes(r.status), "no 5xx": (r) => r.status < 500 });
}
