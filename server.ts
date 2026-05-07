/**
 * server.ts
 *
 * Express application entry point.
 *
 * ─── Startup sequence ──────────────────────────────────────────────────────────
 *
 *   1. Load .env
 *   2. Validate environment (exit immediately if production env is broken)
 *   3. Register global middleware
 *   4. Register routes
 *   5. Listen
 */

import express  from 'express';
import cors     from 'cors';
import dotenv   from 'dotenv';

import { validateEnv }          from './backend/env';
import { log }                  from './backend/logger';
import { requestIdMiddleware }  from './backend/middleware/requestId';
import { analyzeSentenceRouter } from './backend/analyzeSentence';
import { translateRouter }       from './backend/translateRoute';

// ─── 1. Load .env ──────────────────────────────────────────────────────────────

dotenv.config();

// ─── 2. Validate environment ───────────────────────────────────────────────────
// This call exits the process if critical variables are absent in production.

const config = validateEnv();

// ─── 3. Build app ─────────────────────────────────────────────────────────────

const app = express();

// Running behind a reverse proxy (Railway, Render, Cloudflare, etc.) —
// trust the X-Forwarded-For header so rate limiting uses the real client IP.
app.set('trust proxy', 1);

// ── Global middleware ─────────────────────────────────────────────────────────

// CORS — allow all origins by default.  Tighten with an allowlist for production:
//   app.use(cors({ origin: ['https://yourapp.com'] }));
app.use(cors());

// Body parser with hard size limit — rejects payloads > 32 KB before any route
// handler runs.  A valid detailed-analysis request is well under 4 KB.
app.use(express.json({ limit: '32kb' }));

// Attach a unique request ID to every request and return it as X-Request-Id.
app.use(requestIdMiddleware);

// ── Minimal request access log ────────────────────────────────────────────────
//
// Logs method, path, and status for every request.  Does NOT log request bodies.
// Switch off by setting REQUEST_LOG=false.
//
if (process.env.REQUEST_LOG !== 'false') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      log.info('http_request', null, {
        method:     req.method,
        path:       req.path,
        status:     res.statusCode,
        durationMs: Date.now() - start,
        ip:         req.ip ?? 'unknown',
      });
    });
    next();
  });
}

// ─── 4. Routes ─────────────────────────────────────────────────────────────────

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    ok:  true,
    ts:  new Date().toISOString(),
    env: config.nodeEnv,
  });
});

// ── Detailed sentence analysis (production endpoint) ─────────────────────────
//
//   POST /api/sentence-analysis/detailed
//
//   Full request/response contract: backend/types.ts
//   Pipeline: validate → rate-limit → AI model → normalize → respond
//
app.use('/api/sentence-analysis/detailed', analyzeSentenceRouter);

// ── Word translation proxy (DeepL backend) ────────────────────────────────────
//
//   POST /api/translate
//
//   Proxies single-word translation requests to DeepL.
//   Key stays on the server — never exposed to the client.
//
app.use('/api/translate', translateRouter);

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
// Catches anything that escapes route handlers (should not happen, but guards
// against unexpected synchronous throws from middleware).
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error('unhandled_server_error', null, {
    message: (err instanceof Error) ? err.message.slice(0, 200) : 'unknown',
  });
  // Never expose internal error detail to the client.
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 5. Listen ─────────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  log.info('server_started', null, {
    port:  config.port,
    env:   config.nodeEnv,
    model: config.openaiModel,
  });
  process.stdout.write(
    `\n🚀  API running on http://localhost:${config.port}\n` +
    `   POST /api/sentence-analysis/detailed\n` +
    `   POST /api/translate\n` +
    `   GET  /health\n\n`,
  );
});
