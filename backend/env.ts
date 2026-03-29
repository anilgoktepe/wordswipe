/**
 * backend/env.ts
 *
 * Environment validation and typed config.
 *
 * Call `validateEnv()` once at server startup — before any route is registered.
 * It will throw if required variables are absent, printing a clear operational
 * error message that does NOT expose secret values.
 *
 * All other backend modules should import `config` from here instead of reading
 * process.env directly.  This makes it easy to audit what environment state the
 * backend actually depends on.
 */

// ─── Validated config shape ────────────────────────────────────────────────────

export interface AppConfig {
  /** Server port (default 8787). */
  port: number;
  /** Current NODE_ENV ('development' | 'production' | 'test'). */
  nodeEnv: string;
  /** Whether running in production mode. */
  isProduction: boolean;
  /** OpenAI model override (default: 'gpt-4o-mini'). */
  openaiModel: string;
  /**
   * The raw API key is intentionally NOT included here.
   * It is read directly by analyzeSentenceWithModel to keep it out of
   * any accidental serialisation / logging of this config object.
   */
}

// ─── Validation ────────────────────────────────────────────────────────────────

/**
 * Validates required environment variables and returns a typed config object.
 *
 * Behaviour:
 *   - `OPENAI_API_KEY` absent → throws in production; warns in development.
 *   - `PORT` absent or non-numeric → defaults to 8787.
 *   - `NODE_ENV` absent → defaults to 'development' with a warning.
 *
 * @throws {Error} if a required variable is missing in production.
 */
export function validateEnv(): AppConfig {
  const issues: string[] = [];
  const warnings: string[] = [];

  // ── NODE_ENV ────────────────────────────────────────────────────────────────
  const nodeEnv     = (process.env.NODE_ENV ?? '').trim();
  const isProduction = nodeEnv === 'production';

  if (!nodeEnv) {
    process.env.NODE_ENV = 'development';
    warnings.push('NODE_ENV is not set — defaulting to "development".');
  }

  // ── OPENAI_API_KEY ──────────────────────────────────────────────────────────
  const apiKey = (process.env.OPENAI_API_KEY ?? '').trim();

  if (!apiKey) {
    const msg = 'OPENAI_API_KEY is not set. The /api/sentence-analysis/detailed endpoint will not function.';
    if (isProduction) {
      // Hard failure in production — do not start the server without the key.
      issues.push(msg);
    } else {
      warnings.push(msg + ' Running in mock/fallback mode.');
    }
  } else {
    // Confirm presence without revealing the key.
    const maskedLen = Math.max(0, apiKey.length - 4);
    const masked    = '*'.repeat(maskedLen) + apiKey.slice(maskedLen);
    warnings.push(`OPENAI_API_KEY detected (${masked}).`);
  }

  // ── PORT ────────────────────────────────────────────────────────────────────
  const rawPort = process.env.PORT ?? '';
  const port    = rawPort ? parseInt(rawPort, 10) : 8787;

  if (rawPort && (isNaN(port) || port < 1 || port > 65535)) {
    warnings.push(`PORT="${rawPort}" is not a valid port number — defaulting to 8787.`);
    process.env.PORT = '8787';
  }

  // ── OPENAI_MODEL ────────────────────────────────────────────────────────────
  const openaiModel = (process.env.OPENAI_MODEL ?? 'gpt-4o-mini').trim();

  // ── Output warnings ─────────────────────────────────────────────────────────
  for (const w of warnings) {
    // Use process.stderr directly — avoids importing the logger (circular dep).
    process.stderr.write(`[env] WARN  ${w}\n`);
  }

  // ── Hard-fail on issues ─────────────────────────────────────────────────────
  if (issues.length > 0) {
    const banner = [
      '',
      '╔══════════════════════════════════════════════════════╗',
      '║          FATAL: Server startup environment error     ║',
      '╚══════════════════════════════════════════════════════╝',
      '',
      ...issues.map(i => `  ✗  ${i}`),
      '',
      '  Fix the above and restart the server.',
      '',
    ].join('\n');
    process.stderr.write(banner + '\n');
    process.exit(1);
  }

  return {
    port:         isNaN(port) ? 8787 : port,
    nodeEnv:      process.env.NODE_ENV ?? 'development',
    isProduction,
    openaiModel,
  };
}
