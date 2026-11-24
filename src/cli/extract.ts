import "dotenv/config";
import { readFile } from "node:fs/promises";
import { extractInvoice } from "../extraction/extract-invoice.js";
import { AnthropicInvoiceParser } from "../llm/invoice-parser.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run extract -- <invoice.pdf>");
  process.exit(1);
}

const result = await extractInvoice(await readFile(file), {
  parser: new AnthropicInvoiceParser(),
  ownerNip: process.env.OWNER_NIP,
});

console.log(JSON.stringify(result.invoice, null, 2));
console.log(`\nstatus: ${result.status} (attempts: ${result.attempts})`);
for (const issue of result.issues) console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
if (result.failure) console.log(`  failure: ${result.failure}`);
const cost = result.calls.reduce((acc, c) => acc + (c.costUsd ?? 0), 0);
console.log(`cost: ~$${cost.toFixed(4)} over ${result.calls.length} call(s)`);
