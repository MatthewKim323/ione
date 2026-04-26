import { describe, it, expect } from "vitest";
import {
  normalizeLatex,
  literalEqual,
  matchAgainstCanonical,
} from "../src/agents/step-match.js";

describe("normalizeLatex", () => {
  it("collapses whitespace", () => {
    expect(normalizeLatex("  -3 ( 2x - 4 ) = 18 ")).toBe("-3(2x-4)=18");
  });
  it("normalizes \\cdot and \\times", () => {
    expect(normalizeLatex("a \\cdot b")).toBe("a*b");
    expect(normalizeLatex("a \\times b")).toBe("a*b");
  });
  it("strips \\left/\\right", () => {
    expect(normalizeLatex("\\left( a \\right)")).toBe("(a)");
  });
  it("converts unicode minus to ascii hyphen", () => {
    expect(normalizeLatex("\u2212 5")).toBe("-5");
  });
  it("lowercases", () => {
    expect(normalizeLatex("X+1")).toBe("x+1");
  });
});

describe("literalEqual", () => {
  it("matches whitespace-different strings", () => {
    expect(literalEqual("-6x + 12 = 18", "-6x+12=18")).toBe(true);
  });
  it("rejects different signs", () => {
    expect(literalEqual("-6x + 12 = 18", "-6x - 12 = 18")).toBe(false);
  });
});

describe("matchAgainstCanonical", () => {
  const steps = ["-3(2x - 4) = 18", "-6x + 12 = 18", "-6x = 6", "x = -1"];

  it("finds literal match across canonical steps", () => {
    expect(matchAgainstCanonical("-6x+12=18", steps)).toMatchObject({
      equivalent: true,
      source: "literal",
    });
  });
  it("returns no_match for divergent step", () => {
    expect(matchAgainstCanonical("-6x - 12 = 18", steps)).toMatchObject({
      equivalent: false,
      source: "no_match",
    });
  });
  it("rejects empty input", () => {
    expect(matchAgainstCanonical("", steps).equivalent).toBe(false);
  });
});
