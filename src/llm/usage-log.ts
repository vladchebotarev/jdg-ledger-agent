import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/** USD per 1M tokens. Update when prices change; unknown models log cost as null. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export interface LlmCallRecord {
  ts: string;
  purpose: string;
  requestedModel: string;
  servedModel: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  stopReason: string | null;
  latencyMs: number;
  requestId: string | null;
  costUsd: number | null;
}

export function estimateCostUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number },
): number | null {
  const p = PRICES[model];
  if (!p) return null;
  const cost =
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheReadTokens * p.cacheRead +
      usage.cacheWriteTokens * p.input * 1.25) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Appends one JSON line per LLM call. The log never contains document content. */
export async function logLlmCall(record: LlmCallRecord, logFile = process.env.LLM_LOG_FILE ?? "logs/llm-calls.jsonl") {
  await mkdir(path.dirname(logFile), { recursive: true });
  await appendFile(logFile, `${JSON.stringify(record)}\n`, "utf8");
}
