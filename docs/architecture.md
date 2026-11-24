# Architecture

## Principle

**Code computes. The LLM reads and classifies. A human approves and submits.**

Most of the system is a code-driven workflow. Only two parts are agents that choose their own steps:
the classification agent for documents that are not routine, and the Q&A assistant.

## Document lifecycle

```
NEW → EXTRACTED → CLASSIFIED → (NEEDS_REVIEW) → APPROVED → BOOKED
                      ↘ REJECTED (duplicate, not my document, proforma)
```

## Modules

| # | Module | LLM? | Responsibility |
|---|---|---|---|
| 1 | Ingestion | no | `DocumentSource` connectors: KSeF (FA XML), PDF inbox. Deduplicate by seller tax ID + number + amount. Mock KSeF for tests. |
| 2 | Normalization | PDF only | KSeF XML → parser. PDF → structured outputs (Zod) → deterministic validation → one retry with feedback → review. NBP exchange rates for foreign currency. |
| 3 | Classification | yes | Agent with tools: vendor history, tax-law search (RAG), VAT status (VIES / MF white list), NBP rates. Returns a decision with confidence, rationale and citations. |
| 4 | Review queue | human | Low confidence, new vendor or large amount → I approve or correct. Every correction becomes vendor memory and a labeled eval example. |
| 5 | Ledger + tax engine | no | Pure functions with unit tests. Rates and thresholds in versioned config per year. |
| 6 | Reporting | no | Monthly summary (what to pay, where, by when), JPK_V7M draft validated against the official XSD. I sign and submit it myself. |
| 7 | Interfaces | – | CLI first, then an MCP server (read-mostly tools; one write tool, `approve_document`, with explicit confirmation), then a small review UI. |
| 8 | RAG | – | VAT act, PIT act, ryczałt act, selected interpretations; chunked by article; PostgreSQL + pgvector. |

## Ryczałt-specific rules

The owner is taxed with *ryczałt od przychodów ewidencjonowanych*, which changes what matters:

- **Costs do not reduce income tax.** Cost documents matter only for **VAT** (assuming an active VAT
  payer). Classification therefore decides VAT treatment, not "KUP":
  `vatTreatment` (domestic / import of services / intra-EU acquisition / exempt / not deductible) and
  `vatDeduction` (100 / 50 / 0 %).
- **Revenue side:** *ewidencja przychodów* instead of KPiR. Each sales invoice needs a ryczałt rate
  (depends on the type of service, e.g. software services) and a VAT treatment (domestic vs. a service
  to a foreign business taxed where the client is).
- **Tax engine for ryczałt:** monthly revenue, minus the deductions the act allows (social ZUS
  contributions; part of the paid health contribution), times the rate. The health contribution is
  tiered by annual revenue.
- **Every rate, threshold and deduction rule must be verified against official sources for the given
  year before it is implemented**, and lives in `rates/<year>.ts`, never inline in code.

## Evals

| Set | Measures |
|---|---|
| E1 extraction | Field accuracy on PDFs against ground truth (`npm run eval:extraction`) |
| E2 classification | VAT treatment and deduction accuracy; whether errors land in the review queue |
| E3 RAG | Did retrieval find the right article; is the answer correct (LLM-as-judge) |
| E4 backtest | Recompute past months and compare with what was actually filed, to the grosz |

The tax engine is tested with unit tests, not evals: it must be exact, not probably right.

## LLM usage

- Claude API through `@anthropic-ai/sdk`; default model `claude-opus-5-5`, effort `medium` for extraction.
  Cheaper models are an eval-driven decision, made per step with numbers.
- Structured outputs via `client.beta.messages.parse` + `betaZodOutputFormat`; server-side refusal
  fallback enabled (`fallbacks: "default"`).
- Documents are untrusted input: the system prompt tells the model to ignore instructions inside them,
  and nothing the model returns is acted on without validation.
- Every call is logged to `logs/llm-calls.jsonl` (tokens, cost, latency, stop reason); document
  content is never logged.
