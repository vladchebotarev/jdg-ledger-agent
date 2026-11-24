import { z } from "zod";

/**
 * VAT rate as printed on a line.
 * - numeric rates: Polish standard/reduced rates
 * - "zw": exempt (zwolnione)
 * - "reverse_charge": the document says reverse charge / odwrotne obciążenie /
 *   "VAT to be accounted for by the recipient"
 * - "not_applicable": no VAT charged and no reverse-charge statement
 *   (e.g. a US vendor), or "np" (nie podlega)
 */
export const VatRateSchema = z.enum(["23", "8", "5", "0", "zw", "reverse_charge", "not_applicable"]);
export type VatRate = z.infer<typeof VatRateSchema>;

export const PartySchema = z.object({
  name: z.string().describe("Legal name exactly as printed"),
  taxId: z
    .string()
    .nullable()
    .describe(
      "Tax identifier as printed (Polish NIP, EU VAT ID with country prefix, or other). null if none is printed",
    ),
  countryCode: z.string().describe("ISO 3166-1 alpha-2 country code of the party's address, e.g. PL, IE, US"),
  address: z.string().nullable().describe("Full address on one line, or null if not printed"),
});
export type Party = z.infer<typeof PartySchema>;

export const InvoiceLineSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  netAmount: z.number().describe("Line net value in the document currency (negative on corrections)"),
  vatRate: VatRateSchema,
  vatAmount: z.number().describe("Line VAT amount; 0 when no VAT is charged"),
});
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>;

/**
 * What the LLM returns for one document. Everything here is "as printed":
 * no tax decisions are made at this stage.
 */
export const ExtractedInvoiceSchema = z.object({
  documentType: z
    .enum(["invoice", "correction", "proforma", "receipt", "other"])
    .describe("correction = faktura korygująca / credit note; proforma is not a booking document"),
  invoiceNumber: z.string(),
  issueDate: z.string().describe("Issue date as YYYY-MM-DD"),
  saleDate: z.string().nullable().describe("Sale / service date as YYYY-MM-DD, or null if not printed"),
  seller: PartySchema,
  buyer: PartySchema,
  currency: z.string().describe("ISO 4217 currency code, e.g. PLN, EUR, USD"),
  lines: z.array(InvoiceLineSchema),
  totals: z.object({
    net: z.number(),
    vat: z.number(),
    gross: z.number(),
  }),
  reverseCharge: z
    .boolean()
    .describe("true if the document states reverse charge / odwrotne obciążenie / VAT payable by the recipient"),
});
export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>;
