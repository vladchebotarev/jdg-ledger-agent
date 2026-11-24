import type { ExtractedInvoice } from "./invoice.schema.js";

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
}

const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

/** Strips spaces and dashes; uppercases. Country prefixes are kept. */
export function normalizeTaxId(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

/** Check digit for the first 9 digits of a NIP, or null if no valid NIP can end them. */
export function nipCheckDigit(first9: string): number | null {
  if (!/^\d{9}$/.test(first9)) return null;
  const sum = NIP_WEIGHTS.reduce((acc, w, i) => acc + w * Number(first9[i]), 0);
  const check = sum % 11;
  return check === 10 ? null : check;
}

export function isValidNip(raw: string): boolean {
  const digits = normalizeTaxId(raw).replace(/^PL/, "");
  if (!/^\d{10}$/.test(digits)) return false;
  return nipCheckDigit(digits.slice(0, 9)) === Number(digits[9]);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

const NUMERIC_RATES = new Set(["23", "8", "5", "0"]);

/** Money comparisons in grosze to avoid float noise. */
const toMinor = (amount: number) => Math.round(amount * 100);

export interface ValidationOptions {
  /** The owner's NIP. Cost documents should be addressed to it. */
  ownerNip?: string;
  /** Allowed difference in grosze per line when summing (per-line rounding). */
  roundingToleranceMinor?: number;
  today?: Date;
}

/**
 * Deterministic checks on an extracted document. These never call an LLM:
 * if they fail, the extraction is retried with the issues as feedback,
 * then the document goes to human review.
 */
export function validateInvoice(inv: ExtractedInvoice, opts: ValidationOptions = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const tolerance = opts.roundingToleranceMinor ?? 1;
  const add = (code: string, severity: IssueSeverity, message: string) => issues.push({ code, severity, message });

  if (!isIsoDate(inv.issueDate)) add("issue_date_format", "error", `issueDate "${inv.issueDate}" is not YYYY-MM-DD`);
  if (inv.saleDate !== null && !isIsoDate(inv.saleDate))
    add("sale_date_format", "error", `saleDate "${inv.saleDate}" is not YYYY-MM-DD`);
  if (isIsoDate(inv.issueDate) && new Date(`${inv.issueDate}T00:00:00Z`) > (opts.today ?? new Date()))
    add("issue_date_future", "warning", `issueDate ${inv.issueDate} is in the future`);

  if (!/^[A-Z]{3}$/.test(inv.currency)) add("currency_format", "error", `currency "${inv.currency}" is not an ISO 4217 code`);

  if (inv.lines.length === 0) add("no_lines", "error", "document has no lines");

  const lineTolerance = tolerance * Math.max(1, inv.lines.length);
  const sumNet = inv.lines.reduce((acc, l) => acc + toMinor(l.netAmount), 0);
  const sumVat = inv.lines.reduce((acc, l) => acc + toMinor(l.vatAmount), 0);
  if (inv.lines.length > 0 && Math.abs(sumNet - toMinor(inv.totals.net)) > lineTolerance)
    add("lines_net_mismatch", "error", `sum of line net ${sumNet / 100} != total net ${inv.totals.net}`);
  if (inv.lines.length > 0 && Math.abs(sumVat - toMinor(inv.totals.vat)) > lineTolerance)
    add("lines_vat_mismatch", "error", `sum of line VAT ${sumVat / 100} != total VAT ${inv.totals.vat}`);
  if (Math.abs(toMinor(inv.totals.net) + toMinor(inv.totals.vat) - toMinor(inv.totals.gross)) > tolerance)
    add("totals_mismatch", "error", `net ${inv.totals.net} + VAT ${inv.totals.vat} != gross ${inv.totals.gross}`);

  inv.lines.forEach((line, i) => {
    if (NUMERIC_RATES.has(line.vatRate)) {
      const expected = Math.round(toMinor(line.netAmount) * (Number(line.vatRate) / 100));
      // Polish invoices may round VAT per rate group instead of per line, so this is only a warning.
      if (Math.abs(expected - toMinor(line.vatAmount)) > 2)
        add("line_vat_rate", "warning", `line ${i + 1}: VAT ${line.vatAmount} does not match ${line.vatRate}% of ${line.netAmount}`);
    } else if (toMinor(line.vatAmount) !== 0) {
      add("line_vat_nonzero", "error", `line ${i + 1}: rate "${line.vatRate}" but VAT amount is ${line.vatAmount}`);
    }
  });

  for (const [role, party] of [["seller", inv.seller], ["buyer", inv.buyer]] as const) {
    if (party.countryCode === "PL" && party.taxId !== null && !isValidNip(party.taxId))
      add(`${role}_nip_invalid`, "error", `${role} NIP "${party.taxId}" fails the checksum`);
  }

  if (opts.ownerNip && inv.documentType !== "other") {
    const buyer = inv.buyer.taxId ? normalizeTaxId(inv.buyer.taxId).replace(/^PL/, "") : null;
    const seller = inv.seller.taxId ? normalizeTaxId(inv.seller.taxId).replace(/^PL/, "") : null;
    const owner = normalizeTaxId(opts.ownerNip).replace(/^PL/, "");
    if (buyer !== owner && seller !== owner)
      add("not_owner_document", "warning", "neither buyer nor seller tax ID matches the owner's NIP");
  }

  return issues;
}

export const hasErrors = (issues: ValidationIssue[]) => issues.some((i) => i.severity === "error");
