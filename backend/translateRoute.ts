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
const MYMEMORY_URL   = 'https://api.mymemory.translated.net/get';
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

// ─── Provider helpers ─────────────────────────────────────────────────────────

async function _translateWithDeepL(
  text: string,
  from: string,
  to: string,
  apiKey: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(DEEPL_URL, {
      method:  'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body:   JSON.stringify({
        text:        [text],
        source_lang: LANG_MAP[from],
        target_lang: LANG_MAP[to],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json() as { translations?: { text: string }[] };
    return data.translations?.[0]?.text?.trim() ?? null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// MyMemory hata mesajlarını string olarak döndürür — bunları reddet
const MYMEMORY_ERROR_PHRASES = [
  'PLEASE SELECT',
  'MYMEMORY WARNING',
  'QUERY LENGTH',
  'IS AN INVALID',
  'INVALID LANGUAGE',
];

// EN hedefi: sadece Latin + yaygın noktalama izinli
const EN_SCRIPT_RE  = /^[a-zA-ZÀ-ÿ\s\-'",.()\d!?]+$/;
// TR hedefi: Kiril, Arap, CJK, Devanagari vb. yasak
const BAD_SCRIPT_RE = /[\u0400-\u04FF\u0600-\u06FF\u0900-\u097F\u3000-\u9FFF\uAC00-\uD7AF]/;

function _validateMyMemoryResult(translated: string, to: string): boolean {
  const upper = translated.toUpperCase();
  if (MYMEMORY_ERROR_PHRASES.some(p => upper.includes(p))) return false;
  if (to === 'en' && !EN_SCRIPT_RE.test(translated))  return false;
  if (BAD_SCRIPT_RE.test(translated))                 return false;
  return true;
}

async function _translateWithMyMemory(
  text: string,
  from: string,
  to: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 5000);

  const langPair = `${LANG_MAP[from]}|${LANG_MAP[to]}`;
  const url      = `${MYMEMORY_URL}?q=${encodeURIComponent(text)}&langpair=${langPair}`;

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json() as {
      responseData?:  { translatedText?: string; match?: number };
      responseStatus?: number;
    };

    // responseStatus 206 = rate-limited / over quota
    if (data.responseStatus !== undefined && data.responseStatus !== 200) return null;

    const translated = data.responseData?.translatedText?.trim();
    if (!translated) return null;

    // match=0 means MyMemory found nothing; negative means error
    const matchScore = data.responseData?.match ?? 1;
    if (matchScore <= 0) return null;

    if (!_validateMyMemoryResult(translated, to)) return null;

    return translated;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

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

  // ── Try DeepL first, fall back to MyMemory ──────────────────────────────────

  const deeplKey = (process.env.DEEPL_API_KEY ?? '').trim();

  try {
    const translation = deeplKey
      ? await _translateWithDeepL(text.trim(), from, to, deeplKey)
      : await _translateWithMyMemory(text.trim(), from, to);

    if (!translation || translation.toLowerCase() === normalizedText) {
      res.status(502).json({ error: 'No translation found.' });
      return;
    }

    _cacheSet(cacheKey, translation);
    log.info('translate_ok', reqId, { from, to, provider: deeplKey ? 'deepl' : 'mymemory' });
    res.json({ translation });

  } catch (err) {
    const errSummary = safeErrorSummary(err);
    log.error('translate_exception', reqId, { errCode: errSummary.code, errMessage: errSummary.message });
    res.status(502).json({ error: 'Translation request failed.' });
  }
});
