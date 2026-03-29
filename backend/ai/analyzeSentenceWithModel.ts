/**
 * backend/ai/analyzeSentenceWithModel.ts
 *
 * Provider adapter for the AI model call.
 *
 * ─── Design principles ─────────────────────────────────────────────────────────
 *
 *   • The route handler calls `analyzeSentenceWithModel()` — a single,
 *     provider-agnostic function.
 *
 *   • Swapping AI providers (OpenAI → Anthropic → local) only requires
 *     changing this file, not the route or normalization logic.
 *
 *   • The function returns raw model output (string | object).
 *     Normalization is handled separately by `normalizeDetailedAnalysisResult`.
 *
 *   • Errors are typed as `ModelCallError` so the route handler can
 *     distinguish provider failures from validation failures.
 *
 * ─── Timeout ──────────────────────────────────────────────────────────────────
 *
 *   A hard request timeout is enforced.  If the provider does not respond
 *   within MODEL_TIMEOUT_MS, a `ModelCallError` with code 'timeout' is thrown.
 */

import OpenAI from 'openai';
import {
  SENTENCE_ANALYSIS_SYSTEM_PROMPT,
  buildUserMessage,
} from './prompts/sentenceAnalysisPrompt';
import type { SentenceAnalysisRequest } from '../types';

// ─── Configuration ─────────────────────────────────────────────────────────────

/** Hard timeout for one model request. */
const MODEL_TIMEOUT_MS = 20_000;

/** Model to use. gpt-4o-mini balances quality, speed, and cost for this task. */
const MODEL_NAME = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

/**
 * Low temperature for consistent, structured output.
 * Must not be 0 — tiny variation prevents degenerate repetition on retries.
 */
const MODEL_TEMPERATURE = 0.1;

/** Cap output tokens. The JSON response is well under 800 tokens. */
const MAX_TOKENS = 1000;

// ─── Typed error ──────────────────────────────────────────────────────────────

export class ModelCallError extends Error {
  constructor(
    message: string,
    public readonly code: 'timeout' | 'provider' | 'empty_response' | 'config',
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ModelCallError';
  }
}

// ─── Provider interface ───────────────────────────────────────────────────────

/**
 * The raw value returned by the model call.
 * May be a pre-parsed object (if the SDK returns one) or a raw string.
 * The normalizer in `normalizeDetailedAnalysisResult` handles both.
 */
export type RawModelOutput = string | object;

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Calls the configured AI model and returns the raw response content.
 *
 * @throws {ModelCallError} for all provider/network/timeout failures.
 *
 * The caller (route handler) is responsible for normalizing the raw output
 * into a `DetailedAnalysisResult`.
 */
export async function analyzeSentenceWithModel(
  req: SentenceAnalysisRequest,
): Promise<RawModelOutput> {
  const client = _getOpenAIClient();
  const userMessage = buildUserMessage(req);

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  let completion: Awaited<ReturnType<typeof client.chat.completions.create>>;

  try {
    completion = await client.chat.completions.create(
      {
        model:           MODEL_NAME,
        temperature:     MODEL_TEMPERATURE,
        max_tokens:      MAX_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SENTENCE_ANALYSIS_SYSTEM_PROMPT },
          { role: 'user',   content: userMessage },
        ],
      },
      { signal: controller.signal },
    );
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const name = (err as { name?: string })?.name;
    if (name === 'AbortError') {
      throw new ModelCallError(
        `Model request timed out after ${MODEL_TIMEOUT_MS}ms`,
        'timeout',
        err,
      );
    }
    throw new ModelCallError(
      `AI provider error: ${(err as { message?: string })?.message ?? 'unknown'}`,
      'provider',
      err,
    );
  }

  clearTimeout(timeoutId);

  const content = completion.choices[0]?.message?.content;

  if (!content || content.trim().length === 0) {
    throw new ModelCallError(
      'Model returned an empty response',
      'empty_response',
    );
  }

  // `response_format: json_object` means the SDK already validated the JSON
  // is well-formed, so we can attempt to parse and return the object directly.
  try {
    return JSON.parse(content) as object;
  } catch {
    // Return the raw string — the normalizer's _extractJson() will handle it.
    return content;
  }
}

// ─── OpenAI client factory ─────────────────────────────────────────────────────

/** Lazy singleton — created once per process lifetime. */
let _openAIClient: OpenAI | null = null;

function _getOpenAIClient(): OpenAI {
  if (_openAIClient) return _openAIClient;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ModelCallError(
      'OPENAI_API_KEY environment variable is not set',
      'config',
    );
  }

  _openAIClient = new OpenAI({ apiKey });
  return _openAIClient;
}
