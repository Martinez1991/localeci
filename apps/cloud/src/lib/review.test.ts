import { describe, it, expect } from "vitest";
import { applyReviewAction, reviewSummary, type ReviewItem } from "./review.js";

const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({
  id: "1",
  key: "nav.save",
  locale: "pt-BR",
  source: "Save {name}",
  machineTarget: "Salvar {name}",
  score: 82,
  status: "pending",
  ...over,
});

describe("applyReviewAction", () => {
  it("approve → human-approved TM update with the machine target", () => {
    const r = applyReviewAction(item(), { type: "approve" }, "ada", "2026-07-10");
    expect(r.ok).toBe(true);
    expect(r.item.status).toBe("approved");
    expect(r.tmUpdate).toEqual({ source: "Save {name}", target: "Salvar {name}", locale: "pt-BR" });
    expect(r.item.reviewer).toBe("ada");
  });

  it("edit → validated, human-approved with the new text", () => {
    const r = applyReviewAction(item(), { type: "edit", text: "Guardar {name}" }, "ada", "2026-07-10");
    expect(r.ok).toBe(true);
    expect(r.item.status).toBe("edited");
    expect(r.item.finalTarget).toBe("Guardar {name}");
    expect(r.tmUpdate!.target).toBe("Guardar {name}");
  });

  it("edit that breaks a placeholder is rejected with issues", () => {
    const r = applyReviewAction(item(), { type: "edit", text: "Guardar" }, "ada", "2026-07-10");
    expect(r.ok).toBe(false);
    expect(r.tmUpdate).toBeNull();
    expect(r.issues!.some((i) => i.validator === "placeholders")).toBe(true);
  });

  it("empty edit is rejected", () => {
    const r = applyReviewAction(item(), { type: "edit", text: "   " }, "ada", "2026-07-10");
    expect(r.ok).toBe(false);
  });

  it("reject → no TM update, status rejected", () => {
    const r = applyReviewAction(item(), { type: "reject", reason: "wrong tone" }, "ada", "2026-07-10");
    expect(r.item.status).toBe("rejected");
    expect(r.tmUpdate).toBeNull();
  });
});

describe("reviewSummary", () => {
  it("is ready to merge only when all reviewed and none rejected", () => {
    expect(reviewSummary([item({ status: "approved" }), item({ id: "2", status: "edited" })]).readyToMerge).toBe(true);
    expect(reviewSummary([item({ status: "approved" }), item({ id: "2", status: "pending" })]).readyToMerge).toBe(false);
    expect(reviewSummary([item({ status: "rejected" })]).readyToMerge).toBe(false);
  });
});
