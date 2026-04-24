/**
 * backend/translateRoute.ts
 *
 * Express route handler for POST /api/translate
 *
 * ─── Purpose ───────────────────────────────────────────────────────────────────
 *
 *   Backend proxy for DeepL word translation.  The client never touches the
 *   DeepL API directly — the key stays on the server.
 *
 * ─── Request ───────────────────────────────────────────────────────────────────
 *
 *   POST /api/translate
 *   { "text": "calm", "from": "en", "to": "tr" }
 *
 * ─── Response ──────────────────────────────────────────────────────────────────
 *
 *   200  { "translation": "sakin" }
 *   400  { "error": "..." }           bad request
 *   503  { "error": "..." }           DEEPL_API_KEY not configured
 *   502  { "error": "..." }           DeepL upstream error
 *
 * ─── Cache ─────────────────────────────────────────────────────────────────────
 *
 *   In-memory Map keyed by `from:to:normalizedText`.
 *   TTL: 24 hours.  Word translations rarely change; caching prevents redundant
 *   upstream calls for commonly repeated lookups.
 *   No persistence — resets on server restart, which is acceptable.
 */

import { Router, Request, Response } from 'express';
import { log, safeErrorSummary }     from './logger';
import { getRequestId }              from './middleware/requestId';
import { translateLimiter }          from './middleware/rateLimiter';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEEPL_URL      = 'https://api-free.deepl.com/v2/translate';
const CACHE_TTL_MS   = 24 * 60 * 60 * 1000; // 24 hours
const MAX_TEXT_LEN   = 100;                  // single words/short phrases only

// ─── In-memory cache ──────────────────────────────────────────────────────────

interface CacheEntry {
  translation: string;
  expiresAt:   number;
}

const _cache = new Map<string, CacheEntry>();

function _cacheGet(key: string): string | null {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    return null;
  }
  return entry.translation;
}

function _cacheSet(key: string, translation: string): void {
  _cache.set(key, { translation, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── DeepL language code map ──────────────────────────────────────────────────

const LANG_MAP: Record<string, string> = { en: 'EN', tr: 'TR' };

// ─── Router ───────────────────────────────────────────────────────────────────

export const translateRouter = Router();

translateRouter.post('/', translateLimiter, async (req: Request, res: Response) => {
  const reqId = getRequestId(res);

  // ── Validate request ────────────────────────────────────────────────────────

  const { text, from, to } = req.body ?? {};

  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'text is required and must be a non-empty string.' });
    return;
  }
  if (text.trim().length > MAX_TEXT_LEN) {
    res.status(400).json({ error: `text must be ${MAX_TEXT_LEN} characters or fewer.` });
    return;
  }
  if (!LANG_MAP[from] || !LANG_MAP[to] || from === to) {
    res.status(400).json({ error: 'from and to must be "en" or "tr" and must differ.' });
    return;
  }

  const normalizedText = text.trim().toLowerCase();
  const cacheKey       = `${from}:${to}:${normalizedText}`;

  // ── Cache hit ───────────────────────────────────────────────────────────────

  const cached = _cacheGet(cacheKey);
  if (cached) {
    res.json({ translation: cached });
    return;
  }

  // ── Check key ───────────────────────────────────────────────────────────────

  const apiKey = (process.env.DEEPL_API_KEY ?? '').trim();
  if (!apiKey) {
    log.warn('translate_no_key', reqId, {});
    res.status(503).json({ error: 'Translation service is not configured.' });
    return;
  }

  // ── Call DeepL ──────────────────────────────────────────────────────────────

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 5000);

    const upstream = await fetch(DEEPL_URL, {
      method:  'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body:   JSON.stringify({
        text:        [text.trim()],
        source_lang: LANG_MAP[from],
        target_lang: LANG_MAP[to],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!upstream.ok) {
      log.warn('translate_upstream_error', reqId, { status: upstream.status });
      res.status(502).json({ error: 'Translation provider returned an error.' });
      return;
    }

    const data = await upstream.json() as {
      translations?: { text: string }[];
    };

    const translation = data.translations?.[0]?.text?.trim();
    if (!translation) {
      log.warn('translate_empty_response', reqId, {});
      res.status(502).json({ error: 'Translation provider returned an empty result.' });
      return;
    }

    // Discard if identical to input (no actual translation)
    if (translation.toLowerCase() === normalizedText) {
      res.status(502).json({ error: 'No translation found.' });
      return;
    }

    _cacheSet(cacheKey, translation);

    log.info('translate_ok', reqId, { from, to, charCount: text.length });
    res.json({ translation });

  } catch (err) {
    const errSummary = safeErrorSummary(err);
    log.error('translate_exception', reqId, { errCode: errSummary.code, errMessage: errSummary.message });
    res.status(502).json({ error: 'Translation request failed.' });
  }
});
