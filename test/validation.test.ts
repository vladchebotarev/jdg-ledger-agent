import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtractedInvoice } from "../src/domain/invoice.schema.js";
import { hasErrors, isValidNip, nipCheckDigit, validateInvoice } from "../src/domain/validation.js";

const FIXTURES = path.join(import.meta.dirname, "..", "fixtures", "invoices");
const load = (id: string) => JSON.parse(readFileSync(path.join(FIXTURES, `${id}.expected.json`), "utf8")) as ExtractedInvoice;

describe("NIP checksum", () => {
  it("accepts a valid NIP with or without formatting and PL prefix", () => {
    const valid = `527000123${nipCheckDigit("527000123")}`;
    expect(isValidNip(valid)).toBe(true);
    expect(isValidNip(`PL${valid}`)).toBe(true);
    expect(isValidNip(`${valid.slice(0, 3)}-${valid.slice(3, 6)}-${valid.slice(6, 8)}-${valid.slice(8)}`)).toBe(true);
  });

  it("rejects a wrong check digit and wrong length", () => {
    const check = nipCheckDigit("527000123")!;
    expect(isValidNip(`527000123${(check + 1) % 10}`)).toBe(false);
    expect(isValidNip("123")).toBe(false);
  });
});

describe("validateInvoice", () => {
  it("passes every ground-truth fixture without issues", () => {
    for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith(".expected.json"))) {
      const inv = load(file.replace(".expected.json", ""));
      expect(validateInvoice(inv, { ownerNip: inv.buyer.taxId!, today: new Date("2026-12-31") }), file).toEqual([]);
    }
  });

  it("flags totals that do not add up", () => {
    const inv = load("03-pl-laptop-23");
    const broken = { ...inv, totals: { ...inv.totals, gross: inv.totals.gross + 1 } };
    const issues = validateInvoice(broken);
    expect(issues.map((i) => i.code)).toContain("totals_mismatch");
    expect(hasErrors(issues)).toBe(true);
  });

  it("flags line sums that differ from totals", () => {
    const inv = load("02-pl-coworking-mixed-rates");
    const broken = { ...inv, lines: inv.lines.slice(0, 1) };
    expect(validateInvoice(broken).map((i) => i.code)).toEqual(
      expect.arrayContaining(["lines_net_mismatch", "lines_vat_mismatch"]),
    );
  });

  it("flags an invalid Polish NIP but not a foreign VAT ID", () => {
    const pl = load("01-pl-hosting-23");
    expect(validateInvoice({ ...pl, seller: { ...pl.seller, taxId: "1234567890" } }).map((i) => i.code)).toContain("seller_nip_invalid");
    expect(validateInvoice(load("05-ie-cloud-reverse-charge")).map((i) => i.code)).not.toContain("seller_nip_invalid");
  });

  it("warns when the document is not addressed to the owner", () => {
    const inv = load("01-pl-hosting-23");
    const other = `113300400${nipCheckDigit("113300400")}`;
    const codes = validateInvoice({ ...inv, buyer: { ...inv.buyer, taxId: other } }, { ownerNip: "5270001236" }).map((i) => i.code);
    expect(codes).toContain("not_owner_document");
  });

  it("rejects non-ISO dates and VAT on exempt lines", () => {
    const inv = load("04-pl-training-exempt");
    const codes = validateInvoice({
      ...inv,
      issueDate: "12.11.2026",
      lines: [{ ...inv.lines[0]!, vatAmount: 5 }],
    }).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["issue_date_format", "line_vat_nonzero"]));
  });
});
