/**
 * backend/logger.ts
 *
 * Minimal structured logger for the backend.
 *
 * ─── Design ────────────────────────────────────────────────────────────────────
 *
 *   • Output is newline-delimited JSON (NDJSON) — easy to parse by any log
 *     aggregation tool (Datadog, Logtail, CloudWatch, etc.).
 *
 *   • Each log entry includes: level, ts (ISO), event, and any extra context.
 *
 *   • Request ID (`reqId`) is passed explicitly from request handlers so every
 *     log line for a single request can be correlated.
 *
 *   • NEVER logs:
 *       - OPENAI_API_KEY or any other secret
 *       - Full user sentences (use sentenceLen instead)
 *       - Stack traces in client-facing responses
 *       - Internal prompt text
 *
 * ─── Usage ─────────────────────────────────────────────────────────────────────
 *
 *   import { log } from './logger';
 *
 *   log.info('analysis_complete', reqId, { status: 'perfect', durationMs: 123 });
 *   log.warn('rate_limit_hit',    reqId, { ip: '1.2.3.4' });
 *   log.error('model_timeout',    reqId, { code: 'timeout' });
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: string | number | boolean | null | undefined;
}

// ─── Core writer ──────────────────────────────────────────────────────────────

function _write(level: LogLevel, event: string, reqId: string | null, ctx: LogContext): void {
  const entry: Record<string, unknown> = {
    level,
    ts:    new Date().toISOString(),
    event,
    ...(reqId ? { reqId } : {}),
    ...ctx,
  };
  // Always write to stdout — let the process supervisor / log aggregator
  // decide where to route it.
  process.stdout.write(JSON.stringify(entry) + '\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const log = {
  info(event: string, reqId: string | null = null, ctx: LogContext = {}): void {
    _write('info', event, reqId, ctx);
  },

  warn(event: string, reqId: string | null = null, ctx: LogContext = {}): void {
    _write('warn', event, reqId, ctx);
  },

  error(event: string, reqId: string | null = null, ctx: LogContext = {}): void {
    _write('error', event, reqId, ctx);
  },
};

// ─── Safe error serialiser ────────────────────────────────────────────────────

/**
 * Extracts a safe, non-leaking summary from an unknown error value.
 *
 * Never includes stack traces or raw provider error bodies in the return value
 * (those belong in logs, not in client responses).
 */
export function safeErrorSummary(err: unknown): { code: string; message: string } {
  if (err instanceof Error) {
    // Strip any potential secret values that might appear in the message.
    const safeMessage = err.message
      .replace(/sk-[A-Za-z0-9_-]{10,}/g, '[REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');

    return {
      code:    (err as { code?: string }).code ?? err.name ?? 'unknown_error',
      message: safeMessage,
    };
  }
  return { code: 'unknown_error', message: 'An unexpected error occurred.' };
}
