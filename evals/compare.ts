import type { ExtractedInvoice } from "../src/domain/invoice.schema.js";
import { normalizeTaxId } from "../src/domain/validation.js";

/**
 * Fields scored by the extraction eval. Names and addresses are left out on
 * purpose: they are fuzzy and nothing downstream computes with them.
 */
export const SCORED_FIELDS = [
  "documentType",
  "invoiceNumber",
  "issueDate",
  "saleDate",
  "seller.taxId",
  "seller.countryCode",
  "buyer.taxId",
  "currency",
  "totals.net",
  "totals.vat",
  "totals.gross",
  "reverseCharge",
  "lines.count",
  "lines.vatRates",
] as const;
export type ScoredField = (typeof SCORED_FIELDS)[number];

const taxId = (v: string | null) => (v === null ? null : normalizeTaxId(v).replace(/^PL(?=\d{10}$)/, ""));
const amount = (v: number) => Math.round(v * 100);
const compact = (v: string) => v.replace(/\s+/g, " ").trim();

function pick(inv: ExtractedInvoice, field: ScoredField): unknown {
  switch (field) {
    case "documentType": return inv.documentType;
    case "invoiceNumber": return compact(inv.invoiceNumber);
    case "issueDate": return inv.issueDate;
    case "saleDate": return inv.saleDate;
    case "seller.taxId": return taxId(inv.seller.taxId);
    case "seller.countryCode": return inv.seller.countryCode;
    case "buyer.taxId": return taxId(inv.buyer.taxId);
    case "currency": return inv.currency;
    case "totals.net": return amount(inv.totals.net);
    case "totals.vat": return amount(inv.totals.vat);
    case "totals.gross": return amount(inv.totals.gross);
    case "reverseCharge": return inv.reverseCharge;
    case "lines.count": return inv.lines.length;
    case "lines.vatRates": return inv.lines.map((l) => l.vatRate).join(",");
  }
}

export interface FieldResult {
  field: ScoredField;
  pass: boolean;
  expected: unknown;
  actual: unknown;
}

export function compareInvoices(expected: ExtractedInvoice, actual: ExtractedInvoice): FieldResult[] {
  return SCORED_FIELDS.map((field) => {
    const e = pick(expected, field);
    const a = pick(actual, field);
    return { field, pass: e === a, expected: e, actual: a };
  });
}
