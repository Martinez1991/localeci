import { describe, it, expect } from "vitest";
import { redact, createLogger, costAlertLevel } from "./observability.js";

describe("redact", () => {
  it("strips secrets and client content, keeps operational fields", () => {
    const r = redact({
      orgId: "org1",
      authorization: "Bearer lcx_live_secret",
      source: "Confidential UI string",
      target: "PII maybe",
      nested: { apiKey: "k", locale: "pt-BR" },
    }) as Record<string, any>;
    expect(r.orgId).toBe("org1");
    expect(r.authorization).toBe("[redacted]");
    expect(r.source).toBe("[redacted]");
    expect(r.target).toBe("[redacted]");
    expect(r.nested.apiKey).toBe("[redacted]");
    expect(r.nested.locale).toBe("pt-BR"); // non-sensitive kept
  });
});

describe("createLogger", () => {
  it("emits structured JSON with context and redaction via the sink", () => {
    const lines: Record<string, unknown>[] = [];
    const log = createLogger({ requestId: "req1" }, (l) => lines.push(l));
    log.child({ orgId: "org1" }).info("translated", { count: 3, source: "secret text" });
    expect(lines[0]).toMatchObject({ level: "info", msg: "translated", requestId: "req1", orgId: "org1", count: 3 });
    expect(lines[0]!.source).toBe("[redacted]");
  });
});

describe("costAlertLevel", () => {
  it("escalates with spend ratio", () => {
    expect(costAlertLevel(0, 10)).toBe("ok");
    expect(costAlertLevel(8, 10)).toBe("warning");
    expect(costAlertLevel(10, 10)).toBe("critical");
    expect(costAlertLevel(5, 0)).toBe("ok"); // no cap
  });
});
