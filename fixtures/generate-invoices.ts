/**
 * Generates synthetic invoices (PDF) plus the ground-truth JSON the extractor
 * should return for each. All companies, people and tax IDs are fictional;
 * Polish NIPs get a valid checksum so the validator treats them as real-looking.
 *
 *   npm run fixtures:generate
 */
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import type { ExtractedInvoice, Party } from "../src/domain/invoice.schema.js";
import { nipCheckDigit } from "../src/domain/validation.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(here, "invoices");
const FONT = path.join(here, "fonts", "DejaVuSans.ttf");
const FONT_BOLD = path.join(here, "fonts", "DejaVuSans-Bold.ttf");

function nip(first9: string): string {
  const check = nipCheckDigit(first9);
  if (check === null) throw new Error(`no valid NIP starts with ${first9}`);
  return `${first9}${check}`;
}

const OWNER_NIP = nip("527000123");
const owner = (taxIdAsPrinted = OWNER_NIP): Party => ({
  name: "Jan Testowy Software",
  taxId: taxIdAsPrinted,
  countryCode: "PL",
  address: "ul. Przykładowa 1/2, 30-001 Kraków",
});

type Lang = "pl" | "en";

interface Fixture {
  id: string;
  lang: Lang;
  title: string;
  /** Free text printed under the table (legal notes, reverse-charge statements). */
  notes?: string[];
  /** For corrections: values before the correction, printed next to the difference. */
  correctionOf?: { number: string; before: { net: number; vat: number } };
  dateStyle: "pl" | "en-long" | "iso";
  expected: ExtractedInvoice;
}

const fixtures: Fixture[] = [
  {
    id: "01-pl-hosting-23",
    lang: "pl",
    title: "Faktura VAT",
    dateStyle: "pl",
    expected: {
      documentType: "invoice",
      invoiceNumber: "FV/2026/11/0142",
      issueDate: "2026-11-03",
      saleDate: "2026-10-31",
      seller: { name: "Chmurka Hosting Sp. z o.o.", taxId: nip("676100200"), countryCode: "PL", address: "ul. Wielicka 50, 30-552 Kraków" },
      buyer: owner(),
      currency: "PLN",
      lines: [{ description: "Serwer VPS L — październik 2026", quantity: 1, netAmount: 89.0, vatRate: "23", vatAmount: 20.47 }],
      totals: { net: 89.0, vat: 20.47, gross: 109.47 },
      reverseCharge: false,
    },
  },
  {
    id: "02-pl-coworking-mixed-rates",
    lang: "pl",
    title: "Faktura",
    dateStyle: "pl",
    expected: {
      documentType: "invoice",
      invoiceNumber: "12/11/2026",
      issueDate: "2026-11-05",
      saleDate: "2026-10-31",
      seller: { name: "Przestrzeń Coworking S.A.", taxId: nip("945200300"), countryCode: "PL", address: "ul. Lubicz 17, 31-503 Kraków" },
      buyer: owner(),
      currency: "PLN",
      lines: [
        { description: "Hot desk — abonament miesięczny", quantity: 1, netAmount: 650.0, vatRate: "23", vatAmount: 149.5 },
        { description: "Pakiet kawowy", quantity: 1, netAmount: 80.0, vatRate: "8", vatAmount: 6.4 },
      ],
      totals: { net: 730.0, vat: 155.9, gross: 885.9 },
      reverseCharge: false,
    },
  },
  {
    id: "03-pl-laptop-23",
    lang: "pl",
    title: "Faktura VAT",
    dateStyle: "pl",
    expected: {
      documentType: "invoice",
      invoiceNumber: "FV 3381/11/2026",
      issueDate: "2026-11-10",
      saleDate: "2026-11-10",
      seller: { name: "Bajt Sklep Komputerowy Sp. z o.o.", taxId: nip("113300400"), countryCode: "PL", address: "ul. Grójecka 120, 02-367 Warszawa" },
      buyer: owner(),
      currency: "PLN",
      lines: [
        { description: 'Laptop 14" 32 GB RAM / 1 TB SSD', quantity: 1, netAmount: 6499.0, vatRate: "23", vatAmount: 1494.77 },
        { description: "Mysz bezprzewodowa", quantity: 2, netAmount: 118.0, vatRate: "23", vatAmount: 27.14 },
      ],
      totals: { net: 6617.0, vat: 1521.91, gross: 8138.91 },
      reverseCharge: false,
    },
  },
  {
    id: "04-pl-training-exempt",
    lang: "pl",
    title: "Faktura",
    dateStyle: "pl",
    notes: ["Zwolnienie z VAT na podstawie art. 43 ust. 1 pkt 29 lit. c ustawy o VAT."],
    expected: {
      documentType: "invoice",
      invoiceNumber: "FS/77/2026",
      issueDate: "2026-11-12",
      saleDate: "2026-11-12",
      seller: { name: "Akademia Szkoleń Fikus Sp. z o.o.", taxId: nip("679400500"), countryCode: "PL", address: "ul. Rakowicka 7, 31-511 Kraków" },
      buyer: owner(),
      currency: "PLN",
      lines: [{ description: "Szkolenie: Kubernetes w praktyce (2 dni)", quantity: 1, netAmount: 1800.0, vatRate: "zw", vatAmount: 0 }],
      totals: { net: 1800.0, vat: 0, gross: 1800.0 },
      reverseCharge: false,
    },
  },
  {
    id: "05-ie-cloud-reverse-charge",
    lang: "en",
    title: "Invoice",
    dateStyle: "en-long",
    notes: ["Reverse charge: VAT to be accounted for by the recipient (Article 196, Council Directive 2006/112/EC)."],
    expected: {
      documentType: "invoice",
      invoiceNumber: "INV-IE-2026-104857",
      issueDate: "2026-11-01",
      saleDate: "2026-10-31",
      seller: { name: "Nimbus Cloud Services Ltd", taxId: "IE9876543TA", countryCode: "IE", address: "1 Dock Road, Dublin 2, D02 X285, Ireland" },
      buyer: owner(`PL${OWNER_NIP}`),
      currency: "EUR",
      lines: [{ description: "Cloud compute and storage — October 2026", quantity: 1, netAmount: 245.3, vatRate: "reverse_charge", vatAmount: 0 }],
      totals: { net: 245.3, vat: 0, gross: 245.3 },
      reverseCharge: true,
    },
  },
  {
    id: "06-us-saas-no-vat",
    lang: "en",
    title: "Invoice",
    dateStyle: "iso",
    expected: {
      documentType: "invoice",
      invoiceNumber: "CH-7781-2026",
      issueDate: "2026-11-15",
      saleDate: null,
      seller: { name: "CodeHub Inc.", taxId: null, countryCode: "US", address: "500 Market Street, San Francisco, CA 94105, USA" },
      buyer: owner(`PL${OWNER_NIP}`),
      currency: "USD",
      lines: [{ description: "Team plan — 1 seat, monthly", quantity: 1, netAmount: 21.0, vatRate: "not_applicable", vatAmount: 0 }],
      totals: { net: 21.0, vat: 0, gross: 21.0 },
      reverseCharge: false,
    },
  },
  {
    id: "07-pl-correction",
    lang: "pl",
    title: "Faktura korygująca",
    dateStyle: "pl",
    correctionOf: { number: "FV/2026/10/0131", before: { net: 89.0, vat: 20.47 } },
    notes: ["Przyczyna korekty: rabat za niedostępność usługi we wrześniu 2026."],
    expected: {
      documentType: "correction",
      invoiceNumber: "FK/2026/11/0007",
      issueDate: "2026-11-18",
      saleDate: "2026-09-30",
      seller: { name: "Chmurka Hosting Sp. z o.o.", taxId: nip("676100200"), countryCode: "PL", address: "ul. Wielicka 50, 30-552 Kraków" },
      buyer: owner(),
      currency: "PLN",
      lines: [{ description: "Serwer VPS L — wrzesień 2026", quantity: 1, netAmount: -20.0, vatRate: "23", vatAmount: -4.6 }],
      totals: { net: -20.0, vat: -4.6, gross: -24.6 },
      reverseCharge: false,
    },
  },
  {
    id: "08-pl-proforma",
    lang: "pl",
    title: "Faktura pro forma",
    dateStyle: "pl",
    notes: ["Dokument nie jest fakturą VAT i nie stanowi podstawy do odliczenia podatku."],
    expected: {
      documentType: "proforma",
      invoiceNumber: "PRO/112/2026",
      issueDate: "2026-11-20",
      saleDate: null,
      seller: { name: "Bajt Sklep Komputerowy Sp. z o.o.", taxId: nip("113300400"), countryCode: "PL", address: "ul. Grójecka 120, 02-367 Warszawa" },
      buyer: owner(),
      currency: "PLN",
      lines: [{ description: 'Monitor 27" 4K', quantity: 1, netAmount: 1299.0, vatRate: "23", vatAmount: 298.77 }],
      totals: { net: 1299.0, vat: 298.77, gross: 1597.77 },
      reverseCharge: false,
    },
  },
];

// ---------- rendering ----------

const money = (value: number, lang: Lang) =>
  lang === "pl"
    ? value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, " ")
    : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatDate(iso: string, style: Fixture["dateStyle"]): string {
  const [y, m, d] = iso.split("-");
  if (style === "pl") return `${d}.${m}.${y}`;
  if (style === "en-long")
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  return iso;
}

const rateLabel = (rate: string, lang: Lang) =>
  ({ "23": "23%", "8": "8%", "5": "5%", "0": "0%", zw: "zw", reverse_charge: lang === "pl" ? "oo" : "RC", not_applicable: lang === "pl" ? "np" : "—" })[rate] ?? rate;

const L = {
  pl: { number: "nr", issue: "Data wystawienia", sale: "Data sprzedaży", seller: "Sprzedawca", buyer: "Nabywca", taxId: "NIP", currency: "Waluta", cols: ["Lp.", "Nazwa", "Ilość", "Netto", "VAT %", "Kwota VAT", "Brutto"], total: "Razem", due: "Do zapłaty" },
  en: { number: "No.", issue: "Invoice date", sale: "Service period end", seller: "From", buyer: "Bill to", taxId: "VAT ID", currency: "Currency", cols: ["#", "Description", "Qty", "Net", "VAT", "VAT amount", "Total"], total: "Total", due: "Amount due" },
};

async function render(f: Fixture, file: string): Promise<void> {
  const inv = f.expected;
  const t = L[f.lang];
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `${f.title} ${inv.invoiceNumber}` } });
  const done = new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(file);
    stream.on("finish", () => resolve());
    stream.on("error", reject);
    doc.pipe(stream);
  });
  doc.registerFont("R", FONT);
  doc.registerFont("B", FONT_BOLD);

  doc.font("B").fontSize(18).text(`${f.title} ${t.number} ${inv.invoiceNumber}`);
  if (f.correctionOf) doc.font("R").fontSize(10).text(`do faktury nr ${f.correctionOf.number}`);
  doc.moveDown(0.5).font("R").fontSize(10);
  doc.text(`${t.issue}: ${formatDate(inv.issueDate, f.dateStyle)}`);
  if (inv.saleDate) doc.text(`${t.sale}: ${formatDate(inv.saleDate, f.dateStyle)}`);
  doc.text(`${t.currency}: ${inv.currency}`);
  doc.moveDown();

  const top = doc.y;
  for (const [i, [label, party]] of ([[t.seller, inv.seller], [t.buyer, inv.buyer]] as const).entries()) {
    const x = 48 + i * 260;
    doc.font("B").text(label, x, top, { width: 240 });
    doc.font("R").text(party.name, x, doc.y, { width: 240 });
    if (party.address) doc.text(party.address, x, doc.y, { width: 240 });
    if (party.taxId) doc.text(`${t.taxId}: ${party.taxId}`, x, doc.y, { width: 240 });
  }
  doc.x = 48;
  doc.moveDown(2);

  const widths = [28, 190, 36, 70, 44, 70, 70];
  const row = (cells: string[], bold = false) => {
    const y = doc.y;
    let x = 48;
    let bottom = y;
    doc.font(bold ? "B" : "R").fontSize(9);
    cells.forEach((cell, i) => {
      doc.text(cell, x, y, { width: widths[i]!, align: i >= 2 ? "right" : "left" });
      bottom = Math.max(bottom, doc.y);
      x += widths[i]! + 4;
    });
    doc.x = 48;
    doc.y = bottom;
    doc.moveDown(0.6);
  };
  row(t.cols, true);
  inv.lines.forEach((line, i) =>
    row([
      String(i + 1),
      line.description,
      String(line.quantity),
      money(line.netAmount, f.lang),
      rateLabel(line.vatRate, f.lang),
      money(line.vatAmount, f.lang),
      money(line.netAmount + line.vatAmount, f.lang),
    ]),
  );
  row(["", t.total, "", money(inv.totals.net, f.lang), "", money(inv.totals.vat, f.lang), money(inv.totals.gross, f.lang)], true);

  if (f.correctionOf) {
    const { before } = f.correctionOf;
    doc.moveDown();
    row(["", "", "", "Netto", "", "VAT", "Brutto"], true);
    row(["", "Przed korektą", "", money(before.net, "pl"), "", money(before.vat, "pl"), money(before.net + before.vat, "pl")]);
    row(["", "Po korekcie", "", money(before.net + inv.totals.net, "pl"), "", money(before.vat + inv.totals.vat, "pl"), money(before.net + before.vat + inv.totals.gross, "pl")]);
    row(["", "Różnica", "", money(inv.totals.net, "pl"), "", money(inv.totals.vat, "pl"), money(inv.totals.gross, "pl")], true);
  }

  doc.moveDown();
  doc.font("B").fontSize(11).text(`${t.due}: ${money(inv.totals.gross, f.lang)} ${inv.currency}`, 48);
  doc.font("R").fontSize(9);
  for (const note of f.notes ?? []) doc.moveDown(0.5).text(note, 48);
  doc.end();
  await done;
}

await mkdir(OUT_DIR, { recursive: true });
for (const f of fixtures) {
  await render(f, path.join(OUT_DIR, `${f.id}.pdf`));
  await writeFile(path.join(OUT_DIR, `${f.id}.expected.json`), `${JSON.stringify(f.expected, null, 2)}\n`);
}
console.log(`Generated ${fixtures.length} invoices in ${path.relative(process.cwd(), OUT_DIR)} (owner NIP ${OWNER_NIP})`);
