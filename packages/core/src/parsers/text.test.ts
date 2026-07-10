import { describe, it, expect } from "vitest";
import { textParser } from "./text.js";
import { storeFieldLimit, checkStoreLimit } from "../storeMetadata.js";

describe("text parser", () => {
  it("treats the whole file as one string", () => {
    expect(textParser.parse("Best app ever.\nDownload now.\n")).toEqual([
      { key: "content", value: "Best app ever.\nDownload now." },
    ]);
  });
  it("round-trips with trailing newline", () => {
    const raw = "Great app.\n";
    expect(textParser.serialize(textParser.parse(raw), raw)).toBe(raw);
  });
  it("returns empty for blank files", () => {
    expect(textParser.parse("   \n")).toEqual([]);
  });
});

describe("store metadata limits", () => {
  it("knows App Store and Google Play field limits", () => {
    expect(storeFieldLimit("fastlane/metadata/en-US/name.txt")).toBe(30);
    expect(storeFieldLimit("keywords.txt")).toBe(100);
    expect(storeFieldLimit("short_description.txt")).toBe(80);
    expect(storeFieldLimit("random.txt")).toBeNull();
  });
  it("flags an over-limit field", () => {
    const c = checkStoreLimit("name.txt", "A".repeat(40));
    expect(c!.ok).toBe(false);
    expect(c!.over).toBe(10);
  });
  it("passes a within-limit field", () => {
    expect(checkStoreLimit("subtitle.txt", "Short")!.ok).toBe(true);
  });
});
