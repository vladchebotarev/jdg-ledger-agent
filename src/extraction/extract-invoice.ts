import type { ExtractedInvoice } from "../domain/invoice.schema.js";
import { hasErrors, validateInvoice, type ValidationIssue, type ValidationOptions } from "../domain/validation.js";
import type { LlmCallRecord } from "../llm/usage-log.js";
import type { InvoiceParser } from "../llm/invoice-parser.js";

export type ExtractionStatus =
  /** Parsed and passed deterministic validation (warnings allowed). */
  | "extracted"
  /** Parsed, but validation errors remain after retries: a human must look. */
  | "needs_review"
  /** The model refused, ran out of tokens or returned unparseable output. */
  | "failed";

export interface ExtractionResult {
  status: ExtractionStatus;
  invoice: ExtractedInvoice | null;
  issues: ValidationIssue[];
  attempts: number;
  calls: LlmCallRecord[];
  failure?: string;
}

export interface ExtractOptions extends ValidationOptions {
  parser: InvoiceParser;
  /** Total LLM attempts, including the first one. */
  maxAttempts?: number;
}

/**
 * PDF -> structured data. The LLM only reads; deterministic validation decides
 * whether the result is trusted, retried with feedback, or sent to review.
 */
export async function extractInvoice(pdf: Buffer, opts: ExtractOptions): Promise<ExtractionResult> {
  const maxAttempts = opts.maxAttempts ?? 2;
  const calls: LlmCallRecord[] = [];
  let last: { invoice: ExtractedInvoice; issues: ValidationIssue[] } | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const feedback = last
      ? { previous: last.invoice, problems: last.issues.filter((i) => i.severity === "error").map((i) => i.message) }
      : undefined;
    const result = await opts.parser.parse(pdf, feedback);
    calls.push(result.call);

    if (!result.ok) {
      return {
        status: "failed",
        invoice: last?.invoice ?? null,
        issues: last?.issues ?? [],
        attempts: attempt,
        calls,
        failure: `${result.reason}: ${result.detail}`,
      };
    }

    const issues = validateInvoice(result.invoice, opts);
    last = { invoice: result.invoice, issues };
    if (!hasErrors(issues)) return { status: "extracted", invoice: result.invoice, issues, attempts: attempt, calls };
  }

  return { status: "needs_review", invoice: last!.invoice, issues: last!.issues, attempts: maxAttempts, calls };
}
