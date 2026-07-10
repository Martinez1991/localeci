import { describe, it, expect } from "vitest";
import { flatten, unflatten, splitKey, joinKey } from "./flatten.js";

describe("flatten/unflatten", () => {
  it("round-trips nested objects", () => {
    const obj = { a: { b: "x", c: "y" }, d: "z" };
    const { strings, nonStrings } = flatten(obj);
    expect(strings).toEqual([
      { key: "a.b", value: "x" },
      { key: "a.c", value: "y" },
      { key: "d", value: "z" },
    ]);
    expect(unflatten(strings, nonStrings)).toEqual(obj);
  });

  it("handles arrays as numeric segments", () => {
    const obj = { items: ["one", "two"] };
    const { strings } = flatten(obj);
    expect(strings).toEqual([
      { key: "items.0", value: "one" },
      { key: "items.1", value: "two" },
    ]);
    expect(unflatten(strings)).toEqual(obj);
  });

  it("preserves non-string leaves", () => {
    const obj = { n: 5, b: true, s: "hi" };
    const { strings, nonStrings } = flatten(obj);
    expect(strings).toEqual([{ key: "s", value: "hi" }]);
    expect(nonStrings).toEqual({ n: 5, b: true });
    expect(unflatten(strings, nonStrings)).toEqual(obj);
  });

  it("escapes literal dots in keys", () => {
    const key = joinKey(["a.b", "c"]);
    expect(splitKey(key)).toEqual(["a.b", "c"]);
    const obj = { "a.b": { c: "x" } };
    const { strings } = flatten(obj);
    expect(unflatten(strings)).toEqual(obj);
  });
});
