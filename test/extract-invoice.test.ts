import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtractedInvoice } from "../src/domain/invoice.schema.js";
import { extractInvoice } from "../src/extraction/extract-invoice.js";
import type { InvoiceParser, ParseFeedback, ParseResult } from "../src/llm/invoice-parser.js";
import type { LlmCallRecord } from "../src/llm/usage-log.js";
import { compareInvoices } from "../evals/compare.js";

const FIXTURES = path.join(import.meta.dirname, "..", "fixtures", "invoices");
const good = JSON.parse(readFileSync(path.join(FIXTURES, "03-pl-laptop-23.expected.json"), "utf8")) as ExtractedInvoice;
const broken: ExtractedInvoice = { ...good, totals: { ...good.totals, gross: 9999 } };

const call: LlmCallRecord = {
  ts: "", purpose: "test", requestedModel: "fake", servedModel: "fake", inputTokens: 0, outputTokens: 0,
  cacheReadTokens: 0, cacheWriteTokens: 0, stopReason: "end_turn", latencyMs: 0, requestId: null, costUsd: 0,
};

/** Returns the scripted results in order and records the feedback it received. */
class FakeParser implements InvoiceParser {
  feedback: (ParseFeedback | undefined)[] = [];
  constructor(private readonly results: ParseResult[]) {}
  async parse(_pdf: Buffer, feedback?: ParseFeedback): Promise<ParseResult> {
    this.feedback.push(feedback);
    const next = this.results.shift();
    if (!next) throw new Error("no more scripted results");
    return next;
  }
}

const ok = (invoice: ExtractedInvoice): ParseResult => ({ ok: true, invoice, call });
const pdf = Buffer.from("%PDF-fake");

describe("extractInvoice", () => {
  it("accepts a valid first answer without retrying", async () => {
    const parser = new FakeParser([ok(good)]);
    const result = await extractInvoice(pdf, { parser });
    expect(result.status).toBe("extracted");
    expect(result.attempts).toBe(1);
  });

  it("retries with the validation errors as feedback, then accepts the fix", async () => {
    const parser = new FakeParser([ok(broken), ok(good)]);
    const result = await extractInvoice(pdf, { parser });
    expect(result.status).toBe("extracted");
    expect(result.attempts).toBe(2);
    expect(parser.feedback[1]?.problems.join(" ")).toMatch(/gross/);
    expect(parser.feedback[1]?.previous).toEqual(broken);
  });

  it("sends the document to review when errors survive every attempt", async () => {
    const parser = new FakeParser([ok(broken), ok(broken)]);
    const result = await extractInvoice(pdf, { parser });
    expect(result.status).toBe("needs_review");
    expect(result.issues.some((i) => i.code === "totals_mismatch")).toBe(true);
  });

  it("reports a refusal as a failure", async () => {
    const parser = new FakeParser([{ ok: false, reason: "refusal", detail: "declined", call }]);
    const result = await extractInvoice(pdf, { parser });
    expect(result.status).toBe("failed");
    expect(result.failure).toMatch(/refusal/);
  });
});

describe("compareInvoices", () => {
  it("treats PL-prefixed and bare NIPs as equal and catches wrong totals", () => {
    const withPrefix = { ...good, buyer: { ...good.buyer, taxId: `PL${good.buyer.taxId}` } };
    expect(compareInvoices(good, withPrefix).every((f) => f.pass)).toBe(true);
    const failed = compareInvoices(good, broken).filter((f) => !f.pass).map((f) => f.field);
    expect(failed).toEqual(["totals.gross"]);
  });
});
