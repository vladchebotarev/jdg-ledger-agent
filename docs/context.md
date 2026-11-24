# Project context and decisions

Read this at the start of every session. It carries the decisions made while planning the project,
so a new session does not re-open them. Update it when a decision changes or a phase completes.

## Goal

1. **A tool the owner actually uses** for the books of his own JDG every month.
2. **A portfolio project for AI / LLM application engineering.** The owner is a senior full-stack
   developer (Node.js, TypeScript, NestJS, integrations) moving into AI engineering. The project must
   show, with numbers: structured outputs, tool use, agents, RAG, MCP, evals, cost control. He has to
   be able to explain every part in an interview, so he builds the core LLM parts himself
   (see "Working with the owner" in `CLAUDE.md`).

## The owner's situation

- Polish JDG taxed with **ryczałt od przychodów ewidencjonowanych**.
- Assumed to be an **active VAT payer** (to be confirmed by the owner; it drives the cost-side logic).
- Has an **accountant (księgowa)** who keeps the books and files all returns.
- Works on a MacBook. Real documents stay on his machine only (`data/private/`).

## Decisions (and why)

| Decision | Why |
|---|---|
| **Standalone application, not a Claude Code framework** (skills + prompts) | Accounting needs guarantees enforced by code, not instructions the model may skip; each LLM step must be evaluable in isolation; it runs as a pipeline, not a chat; and building the harness is what AI-engineering interviews probe. Claude Code is still used: to build the project, and later as an interface via MCP. |
| **Mostly a workflow; an agent only where steps are unknown in advance** | Extraction, validation, tax math and reporting have a fixed order (code-orchestrated). Only VAT classification of non-routine documents and the Q&A assistant choose their own tool calls. |
| **Code computes, LLM reads and classifies, humans approve and file** | Tax mistakes are expensive. The tax engine is pure functions with unit tests. Nothing is filed by the tool. |
| **The accountant is part of the process** | Her books are the official record, so the tool prepares a monthly package for her and cross-checks her numbers instead of keeping a parallel ledger. Her answers to open questions are eval labels; her past filings are the backtest ground truth. |
| **Ryczałt: no KUP decision** | Costs do not reduce ryczałt tax, so cost documents matter only for VAT (treatment + deduction %). Revenue side: ewidencja przychodów with a ryczałt rate per sales invoice. |
| **Evals for every LLM step** | E1 extraction, E2 classification, E3 RAG, E4 backtest against the accountant's filings. Model and prompt choices are made by eval numbers. |
| **Model per step, chosen by evals** | Starting hypotheses: extraction on Haiku 5.5, VAT classification and RAG Q&A on Sonnet 5.5, LLM-as-judge on Opus 5.5. Switch with `LLM_MODEL`. Haiku has no server-side fallback (`serverFallbackParams()` handles it). |
| **Interfaces: CLI → MCP → small web UI** | CLI first (cheap, debuggable). An MCP server gives a chat interface through Claude Desktop / Claude Code for free. A web review UI (PDF next to extracted fields and the agent's decision) only after evals and backtest work. The accountant gets files, not a UI. |
| **NestJS + PostgreSQL + pgvector from phase 1** | Phase 0 is library code; NestJS arrives with the database and domain modules. pgvector instead of a separate vector DB because the owner knows PostgreSQL well. |
| **Development locally** | Real invoices, the API key in `.env` and Docker live on the owner's machine. Cloud sessions are fine for code work on synthetic fixtures only. |

## Open proposals (not decided yet)

- **Model cascade** (owner task): Haiku first; if validation fails, retry on Sonnet instead of the
  same model. Measure cost and accuracy against single-model runs in the extraction eval.
- **Web review UI** as part of phase 6 (React on top of the NestJS API, 2-3 screens).

## Status

- Phase 0 scaffold is done: schema, validation, extraction with retry, LLM call log, 8 synthetic
  fixtures with ground truth, extraction eval, unit tests.
- Next: the owner tasks of phase 0 in `docs/roadmap.md`.
