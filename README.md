# jdg-ledger-agent

An accounting assistant for a Polish sole proprietorship (JDG) taxed with **ryczałt**, built as an
LLM-application engineering project. I use it for my own books.

It reads cost and sales invoices (from KSeF, Poland's national e-invoicing system, and from PDFs
sent by foreign vendors), extracts them with structured outputs, classifies each document for VAT
with an agent that uses tools and retrieval over tax law, and hands everything that is uncertain to
a human. **All tax math is deterministic code. The LLM never calculates or files anything.**

> Status: **phase 0**. PDF extraction with schema validation, synthetic fixtures and the first eval work.
> See the [roadmap](docs/roadmap.md).

## Why it is built this way

| Concern | Decision |
|---|---|
| Wrong tax numbers are expensive | The LLM reads and classifies. Code computes. A human approves low-confidence decisions. |
| LLM output can be malformed or wrong | Structured outputs with a Zod schema, then deterministic validation (NIP checksum, line sums, totals). Failed validation triggers one retry with the errors as feedback, then human review. |
| "It seems to work" is not a metric | Evals with ground truth for every LLM step, and a backtest of past months against what was actually filed. |
| Financial data is private | Synthetic fixtures in the repo. Real documents stay in a git-ignored folder on my machine. |
| Cost and latency matter | Every LLM call is logged with tokens, cost, latency and stop reason. |

## Architecture

```
Sources            Processing                                          Output
KSeF API ───┐      1. Ingestion (connector per source, dedupe)         CLI
PDF inbox ──┼────▶ 2. Normalization  XML → parser (no LLM)             MCP server
NBP, VIES ──┘                        PDF → LLM + Zod + validation      Monthly summary
                   3. Classification agent (LLM + tools + RAG)         JPK_V7M draft
                   4. Review queue (human)                             Deadlines
                   5. Ledger + tax engine (code only)
```

Details and the ryczałt-specific rules: [docs/architecture.md](docs/architecture.md).

## Quick start

```bash
nvm use                      # Node 22
npm install
cp .env.example .env         # add ANTHROPIC_API_KEY and OWNER_NIP
npm test                     # unit tests, no API calls
npm run extract -- fixtures/invoices/05-ie-cloud-reverse-charge.pdf
npm run eval:extraction      # runs the LLM over all fixtures (costs a few cents)
```

`npm run fixtures:generate` rebuilds the synthetic invoices and their ground-truth JSON.
All companies and tax IDs in the fixtures are fictional.

## Stack

TypeScript, Node 22, Claude API (`@anthropic-ai/sdk`, structured outputs, PDF input), Zod, Vitest.
Coming next: NestJS, PostgreSQL + pgvector, KSeF 2.0 API, MCP server.

## Disclaimer

A personal tool and learning project, not tax advice and not a replacement for an accountant.
