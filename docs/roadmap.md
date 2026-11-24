# Roadmap

Pace: ~10-12 h/week. Each phase ends with a commit, passing tests and, where an LLM is involved, an eval run.

| Phase | Scope | Status |
|---|---|---|
| 0 | PDF extraction (structured outputs + validation + retry), synthetic fixtures, E1 eval, LLM call log | scaffold done, owner tasks below |
| 1 | Domain model + document state machine, NestJS modules, PostgreSQL (docker-compose), NBP rates, E1 on 30 docs | |
| 2 | KSeF 2.0 connector (test environment), FA XML parser, mock KSeF, KSeF/PDF dedupe | |
| 3 | Classification agent with tools (vendor history, VIES/white list, NBP), review queue in CLI, E2 | |
| 4 | Ryczałt tax engine + ZUS/health contribution + deadlines, rates config per year, E4 backtest | |
| 5 | RAG over tax law, Q&A assistant with citations, MCP server, E3 | |
| 6 | JPK_V7M draft + XSD validation, evals in CI, English README polish, architecture diagram, demo video | |
| 7 (optional) | Demo deployment on AWS with synthetic data via Terraform | |

Not in the MVP: OCR of photos, bank integration (CSV import at most), multiple users, automatic submission.

## Phase 0: owner tasks

The scaffold (schema, validation, extraction with retry, fixtures, eval runner, tests) is in place.
These are deliberately left to me, because building them is the point of the project:

1. **Run it.** Add `ANTHROPIC_API_KEY` and `OWNER_NIP` to `.env`, run `npm run extract` on two fixtures,
   then `npm run eval:extraction`. Read `logs/llm-calls.jsonl`: what did one document cost?
2. **Read the code path end to end**: `src/llm/invoice-parser.ts` → `src/extraction/extract-invoice.ts`
   → `src/domain/validation.ts`. Be able to explain why the retry sends validation errors back and why
   the LLM never fixes totals itself.
3. **Break it on purpose.** Put 3-5 of your real invoices into `data/private/` (git-ignored) and run
   `npm run extract` on them. Note every failure: each one is a new fixture idea.
4. **First classification step (write it yourself).** A single structured-output call, no tools yet:
   input = extracted invoice, output = `{ vatTreatment, vatDeduction, confidence, rationale }`.
   Ryczałt means no KUP decision. Write the Zod schema and the prompt in `src/classification/`.
5. **First classification eval (write it yourself).** Label the 8 fixtures by hand in
   `fixtures/invoices/*.classification.json`. Where you are unsure of the correct VAT treatment, ask
   your accountant: the uncertainty itself is useful data. Then mirror `evals/extraction.eval.ts`.
