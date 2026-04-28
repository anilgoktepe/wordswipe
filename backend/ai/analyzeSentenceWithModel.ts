/**
 * backend/ai/analyzeSentenceWithModel.ts
 *
 * Provider adapter for the AI model call — OpenAI.
 *
 * Swapping providers only requires changing this file.
 * The route handler and normalization logic are provider-agnostic.
 */

import OpenAI from 'openai';
import {
  SENTENCE_ANALYSIS_SYSTEM_PROMPT,
  buildUserMessage,
} from './prompts/sentenceAnalysisPrompt';
import type { SentenceAnalysisRequest } from '../types';

// ─── Configuration ─────────────────────────────────────────────────────────────

const MODEL_TIMEOUT_MS  = 20_000;
const MODEL_NAME        = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const MODEL_TEMPERATURE = 0.1;
const MAX_TOKENS        = 1000;

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

export type RawModelOutput = string | object;

// ─── Main export ──────────────────────────────────────────────────────────────

export async function analyzeSentenceWithModel(
  req: SentenceAnalysisRequest,
): Promise<RawModelOutput> {
  const client      = _getOpenAIClient();
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
    throw new ModelCallError('Model returned an empty response', 'empty_response');
  }

  try {
    return JSON.parse(content) as object;
  } catch {
    return content;
  }
}

// ─── OpenAI client factory ─────────────────────────────────────────────────────

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
