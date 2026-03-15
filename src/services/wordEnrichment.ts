/**
 * wordEnrichment.ts
 *
 * Optional enrichment layer: fetches phonetic, part-of-speech, definition, and
 * an extra example sentence from dictionaryapi.dev and caches results in
 * AsyncStorage so the API is called at most once per word.
 *
 * Contract:
 *  - Primary vocabulary data always comes from src/data/vocabulary.ts (offline).
 *  - Enrichment is "nice to have": if the API fails or there is no network, the
 *    function returns null and the app continues with local data.
 *  - Once a word is fetched successfully it is never fetched again.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WordEnrichment {
  word: string;
  phonetic?: string;
  partOfSpeech?: string;
  definition?: string;
  extraExample?: string;
  cachedAt: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_PREFIX = '@wordswipe_enrich_';
const API_BASE     = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cacheKey(word: string): string {
  return `${CACHE_PREFIX}${word.toLowerCase().trim()}`;
}

/** Read a cached enrichment record; returns null if absent or unreadable. */
async function readCache(word: string): Promise<WordEnrichment | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(word));
    if (!raw) return null;
    return JSON.parse(raw) as WordEnrichment;
  } catch {
    return null;
  }
}

/** Write an enrichment record to the cache, silently ignoring write errors. */
async function writeCache(enrichment: WordEnrichment): Promise<void> {
  try {
    await AsyncStorage.setItem(
      cacheKey(enrichment.word),
      JSON.stringify(enrichment),
    );
  } catch {
    // Non-fatal — enrichment is always optional
  }
}

/** Parse the raw dictionaryapi.dev JSON into a tidy WordEnrichment object. */
function parseApiResponse(word: string, data: any[]): WordEnrichment {
  const entry   = data[0] ?? {};
  const meaning = (entry.meanings ?? [])[0] ?? {};
  const def     = (meaning.definitions ?? [])[0] ?? {};

  return {
    word,
    phonetic:     entry.phonetic ?? entry.phonetics?.[0]?.text,
    partOfSpeech: meaning.partOfSpeech,
    definition:   def.definition,
    extraExample: def.example,
    cachedAt:     Date.now(),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns enrichment data for `word`.
 *
 * Resolution order:
 *  1. AsyncStorage cache — returned immediately if present.
 *  2. dictionaryapi.dev — fetched, cached, and returned on success.
 *  3. null — returned if the API is unreachable or returns an error.
 */
export async function getWordEnrichment(word: string): Promise<WordEnrichment | null> {
  // 1. Cache hit
  const cached = await readCache(word);
  if (cached) return cached;

  // 2. Network fetch
  try {
    const response = await fetch(`${API_BASE}${encodeURIComponent(word)}`, {
      // Short timeout — enrichment should not block the UI
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const enrichment = parseApiResponse(word, data);
    await writeCache(enrichment);
    return enrichment;
  } catch {
    // Network error, timeout, parse failure — all treated as "no enrichment"
    return null;
  }
}

/**
 * Pre-fetches enrichment for a batch of words in the background.
 * Errors are swallowed; the results end up in the cache for later reads.
 * Call this after a lesson loads to warm the cache for the upcoming quiz.
 */
export async function prefetchEnrichments(words: string[]): Promise<void> {
  // Fire-and-forget; don't await individual failures
  await Promise.allSettled(words.map(w => getWordEnrichment(w)));
}

/**
 * Removes all enrichment cache entries.
 * Useful from the settings/reset screen if the user clears all progress.
 */
export async function clearEnrichmentCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const enrichKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
    if (enrichKeys.length > 0) {
      await AsyncStorage.multiRemove(enrichKeys);
    }
  } catch {
    // Non-fatal
  }
}
