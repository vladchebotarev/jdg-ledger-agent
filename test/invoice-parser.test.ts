import { describe, expect, it } from "vitest";
import { serverFallbackParams } from "../src/llm/invoice-parser.js";

describe("serverFallbackParams", () => {
  it("enables server-side fallback for Opus and Sonnet", () => {
    for (const model of ["claude-opus-5-5", "claude-sonnet-5-5"]) {
      expect(serverFallbackParams(model)).toEqual({ betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    }
  });

  it("sends no fallback for Haiku, which has none", () => {
    expect(serverFallbackParams("claude-haiku-5-5")).toEqual({});
  });
});
