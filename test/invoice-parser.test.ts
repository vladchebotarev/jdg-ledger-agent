import { readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { AnthropicInvoiceParser, serverFallbackParams } from "../src/llm/invoice-parser.js";
import type { LlmCallRecord } from "../src/llm/usage-log.js";

const FIXTURES = path.join(import.meta.dirname, "..", "fixtures", "invoices");
const goodJson = readFileSync(path.join(FIXTURES, "03-pl-laptop-23.expected.json"), "utf8");

/** Runs the real SDK against a canned HTTP response, so its own parsing behaviour is covered. No network. */
async function parseWith(message: { text?: string; stop_reason: string; stop_details?: unknown }) {
  const logged: LlmCallRecord[] = [];
  const body = {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: message.text === undefined ? [] : [{ type: "text", text: message.text }],
    stop_reason: message.stop_reason,
    stop_details: message.stop_details ?? null,
    usage: { input_tokens: 10, output_tokens: 5 },
  };
  const client = new Anthropic({
    apiKey: "test",
    maxRetries: 0,
    fetch: async () =>
      new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json", "request-id": "req_test" },
      }),
  });
  const parser = new AnthropicInvoiceParser({
    client,
    model: "claude-opus-5-5",
    log: async (record) => {
      logged.push(record);
    },
  });
  return { result: await parser.parse(Buffer.from("%PDF-fake")), logged };
}

describe("AnthropicInvoiceParser", () => {
  it("returns the invoice and logs the call with its request id", async () => {
    const { result, logged } = await parseWith({ text: goodJson, stop_reason: "end_turn" });
    expect(result.ok && result.invoice).toEqual(JSON.parse(goodJson));
    expect(logged).toHaveLength(1);
    expect(logged[0]?.requestId).toBe("req_test");
  });

  it("reports output cut off at max_tokens and still logs the call", async () => {
    const { result, logged } = await parseWith({ text: goodJson.slice(0, 80), stop_reason: "max_tokens" });
    expect(result).toMatchObject({ ok: false, reason: "max_tokens" });
    expect(logged).toHaveLength(1);
  });

  it.each([
    ["invalid JSON", '{"invoiceNumber": "SECRET-1'],
    ["JSON that does not match the schema", '{"invoiceNumber": "SECRET-1"}'],
    ["no text at all", undefined],
  ])("reports %s as unparseable, without leaking content, and logs the call", async (_name, text) => {
    const { result, logged } = await parseWith({ text, stop_reason: "end_turn" });
    expect(result).toMatchObject({ ok: false, reason: "unparseable" });
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(logged).toHaveLength(1);
  });

  it("reports a refusal that left partial text and logs the call", async () => {
    const { result, logged } = await parseWith({
      text: "I can",
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: null, explanation: "declined by policy" },
    });
    expect(result).toMatchObject({ ok: false, reason: "refusal", detail: "declined by policy" });
    expect(logged).toHaveLength(1);
  });
});

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
