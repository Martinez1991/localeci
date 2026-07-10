/**
 * k6 load test for the public playground endpoint (issue #18).
 *
 * Validates the rate limiter + budget circuit breaker under load and captures
 * latency SLOs. Run:
 *   BASE_URL=https://localeci.dev k6 run load/playground.k6.js
 *
 * Expectations: most requests are either translated (200) or throttled (429/402)
 * — never 5xx — and p95 latency stays within budget.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const errorRate = new Rate("errors");

export const options = {
  scenarios: {
    ramp: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "1m", target: 200 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    // No server errors, and latency SLOs.
    errors: ["rate<0.01"],
    http_req_duration: ["p(95)<1500", "p(99)<3000"],
    // Throttling is expected and healthy, not an error.
    "http_req_failed{expected_response:true}": ["rate<0.01"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export default function () {
  const res = http.post(
    `${BASE_URL}/api/v1/playground`,
    JSON.stringify({ source: "Save changes", sourceLocale: "en", targetLocale: "pt-BR" }),
    { headers: { "Content-Type": "application/json" } },
  );

  // 200 translated, 429 rate-limited, 402 budget cap — all acceptable.
  const ok = check(res, {
    "status is 200/429/402": (r) => [200, 429, 402].includes(r.status),
    "no server error": (r) => r.status < 500,
  });
  errorRate.add(!ok);
  sleep(0.5);
}
