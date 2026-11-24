/**
 * Extraction eval: runs the real LLM over every fixture PDF and scores the
 * fields in SCORED_FIELDS against the ground truth. Costs real API money:
 * roughly one call per document (two when validation triggers a retry).
 *
 *   npm run eval:extraction            # all fixtures
 *   npm run eval:extraction -- 05 07   # only fixtures whose name starts with these prefixes
 */
import "dotenv/config";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtractedInvoice } from "../src/domain/invoice.schema.js";
import { extractInvoice } from "../src/extraction/extract-invoice.js";
import { AnthropicInvoiceParser } from "../src/llm/invoice-parser.js";
import { compareInvoices, SCORED_FIELDS, type FieldResult } from "./compare.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, "..", "fixtures", "invoices");
const prefixes = process.argv.slice(2);

const ids = (await readdir(FIXTURES))
  .filter((f) => f.endsWith(".pdf"))
  .map((f) => f.replace(/\.pdf$/, ""))
  .filter((id) => prefixes.length === 0 || prefixes.some((p) => id.startsWith(p)))
  .sort();

const parser = new AnthropicInvoiceParser();
const perDoc: { id: string; status: string; attempts: number; costUsd: number; fields: FieldResult[] }[] = [];

for (const id of ids) {
  const expected = JSON.parse(await readFile(path.join(FIXTURES, `${id}.expected.json`), "utf8")) as ExtractedInvoice;
  const result = await extractInvoice(await readFile(path.join(FIXTURES, `${id}.pdf`)), {
    parser,
    ownerNip: expected.buyer.taxId ?? undefined,
  });
  const fields = result.invoice
    ? compareInvoices(expected, result.invoice)
    : SCORED_FIELDS.map((field) => ({ field, pass: false, expected: "-", actual: "no output" }));
  const costUsd = result.calls.reduce((acc, c) => acc + (c.costUsd ?? 0), 0);
  perDoc.push({ id, status: result.status, attempts: result.attempts, costUsd, fields });

  const failed = fields.filter((f) => !f.pass);
  console.log(`${failed.length === 0 ? "PASS" : "FAIL"}  ${id}  [${result.status}, ${result.attempts} attempt(s), $${costUsd.toFixed(4)}]`);
  for (const f of failed) console.log(`        ${f.field}: expected ${JSON.stringify(f.expected)}, got ${JSON.stringify(f.actual)}`);
}

console.log("\nField accuracy:");
for (const field of SCORED_FIELDS) {
  const passed = perDoc.filter((d) => d.fields.find((f) => f.field === field)?.pass).length;
  console.log(`  ${field.padEnd(20)} ${passed}/${perDoc.length}`);
}
const docsPassed = perDoc.filter((d) => d.fields.every((f) => f.pass)).length;
const totalCost = perDoc.reduce((acc, d) => acc + d.costUsd, 0);
console.log(`\nDocuments fully correct: ${docsPassed}/${perDoc.length} · total cost ~$${totalCost.toFixed(4)}`);

const outDir = path.join(here, "results");
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, `extraction-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await writeFile(outFile, JSON.stringify({ model: process.env.LLM_MODEL ?? "default", perDoc }, null, 2));
console.log(`Saved ${path.relative(process.cwd(), outFile)}`);
