/**
 * backend/middleware/rateLimiter.ts
 *
 * Per-IP rate limiting for the production AI endpoints.
 *
 * ─── Limits ────────────────────────────────────────────────────────────────────
 *
 *   DETAILED_ANALYSIS_LIMITER
 *     Window : 15 minutes
 *     Max    : 30 requests per IP
 *     Route  : POST /api/sentence-analysis/detailed
 *
 *   Rationale: a normal user doing focused vocabulary practice will not hit
 *   30 requests in 15 minutes.  This blocks automated abuse while staying
 *   invisible to real users.
 *
 * ─── Behaviour on limit hit ────────────────────────────────────────────────────
 *
 *   • HTTP 429 with a safe JSON body
 *   • `Retry-After` header set automatically by express-rate-limit
 *   • No stack trace or internal detail exposed
 *   • The hit is logged with the request ID and IP for observability
 *
 * ─── Override for tests / CI ──────────────────────────────────────────────────
 *
 *   Set DISABLE_RATE_LIMIT=true to skip limiting entirely (tests / local dev).
 */

import rateLimit, { type Options }    from 'express-rate-limit';
import type { Request, Response }     from 'express';
import { log }                        from '../logger';
import { getRequestId }               from './requestId';

// ─── Shared handler for all 429 responses ─────────────────────────────────────

function _onLimitReached(req: Request, res: Response): void {
  const reqId = getRequestId(res);

  // Log with IP (no sentence content — just the fact that a limit was hit).
  log.warn('rate_limit_hit', reqId, {
    ip:     req.ip ?? 'unknown',
    path:   req.path,
    method: req.method,
  });

  // Safe, generic response — no internal detail.
  res.status(429).json({
    error:   'Too many requests',
    message: 'Rate limit exceeded. Please wait a moment before trying again.',
    retryAfterSeconds: Math.ceil(
      (res.getHeader('Retry-After') as number | undefined ?? 60)
    ),
  });
}

// ─── Limiter factory ──────────────────────────────────────────────────────────

function _makeLimiter(opts: Partial<Options>) {
  if (process.env.DISABLE_RATE_LIMIT === 'true') {
    // Passthrough middleware — no limiting.
    return (_req: Request, _res: Response, next: () => void) => next();
  }

  return rateLimit({
    windowMs:         15 * 60 * 1000, // 15 minutes
    max:              30,
    standardHeaders:  true,            // Adds RateLimit-* headers (RFC 6585)
    legacyHeaders:    false,           // Suppress deprecated X-RateLimit-* headers
    handler:          _onLimitReached,
    // Use IP as key.  If behind a proxy, set `app.set('trust proxy', 1)` in server.ts
    // and express-rate-limit will use the X-Forwarded-For IP automatically.
    keyGenerator: (req: Request) => req.ip ?? 'unknown',
    ...opts,
  });
}

// ─── Exported limiters ────────────────────────────────────────────────────────

/**
 * Rate limiter for the premium detailed-analysis endpoint.
 * 30 requests per IP per 15-minute window.
 */
export const detailedAnalysisLimiter = _makeLimiter({ max: 30 });
