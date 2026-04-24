/**
 * vocabularyService.ts
 *
 * Abstraction layer over vocabulary sources.
 *
 * Current sources:
 *  - LOCAL   : the static vocabulary array in src/data/vocabulary.ts (offline, always available)
 *  - API     : https://api.dictionaryapi.dev/api/v2/entries/en/{word} (network, optional)
 *
 * Design rules:
 *  - Local vocabulary is always the authoritative source for the SRS engine.
 *    Nothing in this file replaces or mutates vocabulary.ts.
 *  - API calls are "opt-in enrichment" — callers must handle null gracefully.
 *  - In-memory cache prevents redundant network requests within a single session.
 *    It is intentionally not persisted (for that, see wordEnrichment.ts).
 */

import {
  vocabulary,
  getWordsByLevel as getLocalByLevel,
  CEFRLevel,
  CEFR_GROUPS,
  getWordsByCEFR,
  Word,
} from '../data/vocabulary';

// ─── API types ────────────────────────────────────────────────────────────────

/** A single definition within a part-of-speech meaning block. */
export interface ApiDefinition {
  definition: string;
  example?: string;
  synonyms: string[];
  antonyms: string[];
}

/** A meaning block grouping definitions by part of speech. */
export interface ApiMeaning {
  partOfSpeech: string;
  definitions: ApiDefinition[];
  synonyms: string[];
  antonyms: string[];
}

/** A single phonetic entry (text + optional audio URL). */
export interface ApiPhonetic {
  text?: string;
  audio?: string;
  sourceUrl?: string;
  license?: { name: string; url: string };
}

/**
 * One entry from the Free Dictionary API.
 * https://api.dictionaryapi.dev/api/v2/entries/en/{word}
 * The API returns an array of these; the first entry is the canonical one.
 */
export interface ApiWordEntry {
  word: string;
  phonetic?: string;
  phonetics: ApiPhonetic[];
  meanings: ApiMeaning[];
  license: { name: string; url: string };
  sourceUrls: string[];
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
//
// Keys are lower-cased, trimmed word strings.
// Values are the first ApiWordEntry returned by the API.
// The cache lives only for the duration of the app session; for persistent
// caching of enrichment data, refer to wordEnrichment.ts.

const _apiCache = new Map<string, ApiWordEntry>();

// ─── Local vocabulary accessors ───────────────────────────────────────────────

/**
 * Returns the full local vocabulary array.
 * This is the same array that drives the SRS engine — no copy is made.
 */
export function getLocalWords(): Word[] {
  return vocabulary;
}

/**
 * Returns local words filtered by the coarse difficulty tier.
 * Delegates to the canonical helper in vocabulary.ts.
 */
export function getWordsByLevel(level: 'easy' | 'medium' | 'hard'): Word[] {
  return getLocalByLevel(level);
}

/**
 * Returns local words that belong to a specific CEFR level.
 * Words with an explicit `cefrLevel` field are matched directly;
 * others fall back to the CEFR_GROUPS tier mapping.
 */
export function getWordsByCEFRLevel(cefr: CEFRLevel): Word[] {
  return getWordsByCEFR(cefr);
}

/**
 * Returns a map of { easy: Word[], medium: Word[], hard: Word[] }
 * for callers that need all tiers at once.
 */
export function getLocalWordsByAllLevels(): Record<Word['level'], Word[]> {
  return {
    easy:   getLocalByLevel('easy'),
    medium: getLocalByLevel('medium'),
    hard:   getLocalByLevel('hard'),
  };
}

// ─── API vocabulary accessor ──────────────────────────────────────────────────

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

/**
 * Fetches raw dictionary data for a single English word from the Free Dictionary
 * API.  Results are cached in memory so repeated calls for the same word within
 * a session cost no network round-trips.
 *
 * Returns `null` if:
 *  - the network request fails
 *  - the API returns a non-2xx status (e.g. 404 for unknown words)
 *  - the response cannot be parsed
 *
 * Callers must always handle the `null` case gracefully — the app must work
 * completely offline using local vocabulary.
 */
export async function getApiWord(word: string): Promise<ApiWordEntry | null> {
  const key = word.toLowerCase().trim();
  if (!key) return null;

  // Return cached result immediately
  const cached = _apiCache.get(key);
  if (cached) return cached;

  try {
    const response = await fetch(`${API_BASE}${encodeURIComponent(key)}`);
    if (!response.ok) return null;

    const data = await response.json() as ApiWordEntry[];
    if (!Array.isArray(data) || data.length === 0) return null;

    const entry = data[0];
    _apiCache.set(key, entry);
    return entry;
  } catch {
    // Network error, JSON parse error, etc. — fail silently
    return null;
  }
}

// ─── Cache utilities ──────────────────────────────────────────────────────────

/** Returns true if the API result for `word` is already in the session cache. */
export function isApiWordCached(word: string): boolean {
  return _apiCache.has(word.toLowerCase().trim());
}

/** Clears the in-memory API cache. Useful for testing or low-memory situations. */
export function clearApiCache(): void {
  _apiCache.clear();
}

/** Returns the current number of entries in the in-memory API cache. */
export function apiCacheSize(): number {
  return _apiCache.size;
}

// ─── Dynamic word-source engine ───────────────────────────────────────────────
//
// getWords() is the unified entry point for future multi-source vocabulary.
// It keeps getLocalWords() working unchanged while preparing the service to
// merge in remote word lists (API, user-added, level packs, etc.).
//
// Source semantics:
//   'local'  — static vocabulary.ts (offline, instant, authoritative for SRS)
//   'api'    — remote word-list endpoint (placeholder until endpoint exists)
//   'mixed'  — local + API merged; local words always win on id/text conflicts

/** Identifies where a word list should be loaded from. */
export type WordSource = 'local' | 'api' | 'mixed';

export interface GetWordsOptions {
  source?: WordSource;
}

/**
 * Per-source result cache.
 * `null` means "not yet fetched"; a populated array means "already resolved".
 * Cleared by clearWordsCache().
 */
let _cachedWordsBySource: Partial<Record<WordSource, Word[]>> = {};

/**
 * Unified, source-aware vocabulary accessor.
 *
 * | source  | behaviour                                              |
 * |---------|--------------------------------------------------------|
 * | 'local' | Returns local static words — same as getLocalWords()  |
 * | 'api'   | Fetches from the remote word-list endpoint (stub now) |
 * | 'mixed' | Local + API, deduplicated; local words take priority   |
 *
 * Defaults to 'local' when called with no options — zero breaking change.
 * Results are cached per-source for the session; call clearWordsCache() to
 * invalidate.
 *
 * Always resolves — never rejects. Network failures fall back to [] for the
 * API slice so the app stays fully functional offline.
 */
export async function getWords(options?: GetWordsOptions): Promise<Word[]> {
  const source: WordSource = options?.source ?? 'local';

  // ── Cache hit ──────────────────────────────────────────────────────────────
  const cached = _cachedWordsBySource[source];
  if (cached !== undefined) return cached;

  // ── Cache miss: resolve from source ───────────────────────────────────────
  let result: Word[];

  switch (source) {
    case 'local':
      result = getLocalWords();
      break;

    case 'api':
      result = await _fetchApiWords();
      break;

    case 'mixed': {
      // Fetch both concurrently; API failure returns [] so local always works.
      const [local, remote] = await Promise.all([
        Promise.resolve(getLocalWords()),
        _fetchApiWords(),
      ]);
      result = _mergeWords(local, remote);
      break;
    }
  }

  _cachedWordsBySource[source] = result;
  return result;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

// ─── API word configuration ───────────────────────────────────────────────────

/**
 * IDs start at 100_000 — no collision with local vocabulary IDs (1-based, low hundreds).
 * A word's stable ID within a session = API_ID_OFFSET + its index in _API_WORD_POOL.
 */
const API_ID_OFFSET = 100_000;

/** How many words to randomly pick from the pool on each call. */
const API_WORD_PICK_COUNT = 10;

/**
 * Full pool of candidate words. 10 are sampled randomly per call so that
 * repeated API fetches surface different vocabulary.
 */
const _API_WORD_POOL = [
  'apple', 'car', 'house', 'book', 'water', 'light', 'door', 'road', 'tree', 'sun',
  'chair', 'table', 'phone', 'clock', 'bread', 'fire', 'rain', 'wind', 'snow', 'leaf',
  'stone', 'river', 'bridge', 'garden', 'market', 'school', 'doctor', 'teacher',
  'kitchen', 'library', 'hospital', 'mountain', 'umbrella', 'butterfly', 'chocolate',
  'newspaper', 'telephone', 'dictionary', 'adventure', 'education',
] as const;

/**
 * Turkish translations for each pool word.
 * If a word is missing, the English definition from the API is used as fallback.
 */
const _TURKISH_TRANSLATIONS: Partial<Record<typeof _API_WORD_POOL[number], string>> = {
  apple:      'elma',
  car:        'araba',
  house:      'ev',
  book:       'kitap',
  water:      'su',
  light:      'ışık',
  door:       'kapı',
  road:       'yol',
  tree:       'ağaç',
  sun:        'güneş',
  chair:      'sandalye',
  table:      'masa',
  phone:      'telefon',
  clock:      'saat',
  bread:      'ekmek',
  fire:       'ateş',
  rain:       'yağmur',
  wind:       'rüzgar',
  snow:       'kar',
  leaf:       'yaprak',
  stone:      'taş',
  river:      'nehir',
  bridge:     'köprü',
  garden:     'bahçe',
  market:     'çarşı',
  school:     'okul',
  doctor:     'doktor',
  teacher:    'öğretmen',
  kitchen:    'mutfak',
  library:    'kütüphane',
  hospital:   'hastane',
  mountain:   'dağ',
  umbrella:   'şemsiye',
  butterfly:  'kelebek',
  chocolate:  'çikolata',
  newspaper:  'gazete',
  telephone:  'telefon',
  dictionary: 'sözlük',
  adventure:  'macera',
  education:  'eğitim',
};

/** Derive difficulty level from word length. */
function _wordLevel(word: string): 'easy' | 'medium' | 'hard' {
  const len = word.length;
  if (len <= 5) return 'easy';
  if (len <= 8) return 'medium';
  return 'hard';
}

/** Fisher-Yates shuffle — returns a new array, does not mutate input. */
function _shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Fetches a random sample of words from the Free Dictionary API and maps each
 * entry to the app's `Word` type.
 *
 * Improvements over the previous implementation:
 *  - Turkish translation via `_TURKISH_TRANSLATIONS`, falls back to definition.
 *  - Randomised word selection from a 40-word pool (10 picked per call).
 *  - Level derived from word length: ≤5 → easy, 6-8 → medium, 9+ → hard.
 *  - Safe fallback: if every API call fails, returns first 5 local words so
 *    the app never appears empty.
 *
 * Caching is handled by the caller (`getWords()`); this function is stateless.
 * Always resolves — never throws.
 */
async function _fetchApiWords(): Promise<Word[]> {
  const selected = _shuffle(_API_WORD_POOL).slice(0, API_WORD_PICK_COUNT);
  const results: Word[] = [];

  await Promise.all(
    selected.map(async (seedWord) => {
      // Stable numeric ID: position of the word in the original pool array.
      const poolIndex = _API_WORD_POOL.indexOf(seedWord as typeof _API_WORD_POOL[number]);
      try {
        const response = await fetch(
          `${API_BASE}${encodeURIComponent(seedWord)}`,
        );
        if (!response.ok) return;

        const data = await response.json() as ApiWordEntry[];
        if (!Array.isArray(data) || data.length === 0) return;

        const entry        = data[0];
        const firstDef     = entry.meanings?.[0]?.definitions?.[0];
        const defText      = firstDef?.definition ?? '';
        const exampleText  = firstDef?.example    ?? '';

        if (!defText) return;

        const turkishOrDef =
          _TURKISH_TRANSLATIONS[seedWord as typeof _API_WORD_POOL[number]] ?? defText;

        const word: Word = {
          id:          API_ID_OFFSET + poolIndex,
          word:        entry.word,
          translation: turkishOrDef,
          example:     exampleText,
          level:       _wordLevel(entry.word),
        };

        results.push(word);
      } catch {
        // Network / parse error — skip this word silently.
      }
    }),
  );

  // Safe fallback: never return an empty list to the app.
  if (results.length === 0) {
    return getLocalWords().slice(0, 5);
  }

  return results;
}

/**
 * Merges a local and a remote word list, removing duplicates.
 *
 * Deduplication rules (local always wins):
 *  1. A remote word whose `id` matches any local word is dropped.
 *  2. A remote word whose `word` text (case-insensitive) matches any local
 *     word is dropped (catches id-mismatch duplicates across sources).
 *  3. All remaining remote words are appended after the local list.
 */
function _mergeWords(local: Word[], remote: Word[]): Word[] {
  const localIds   = new Set(local.map(w => w.id));
  const localTexts = new Set(local.map(w => w.word.toLowerCase()));
  const uniqueRemote = remote.filter(
    w => !localIds.has(w.id) && !localTexts.has(w.word.toLowerCase()),
  );
  return [...local, ...uniqueRemote];
}

// ─── Words-cache utilities ────────────────────────────────────────────────────

/**
 * Clears the getWords() result cache.
 *
 * Pass a specific source to invalidate only that slice, or call with no
 * argument to wipe all sources (e.g. after a remote vocabulary update).
 */
export function clearWordsCache(source?: WordSource): void {
  if (source !== undefined) {
    delete _cachedWordsBySource[source];
  } else {
    _cachedWordsBySource = {};
  }
}

// ─── Normalized key ───────────────────────────────────────────────────────────

/**
 * Canonical word key used for all duplicate checks and merge comparisons.
 * Single source of truth: trim + lowercase, nothing else.
 * Do not add stemming or punctuation stripping here — keep it predictable.
 */
export function normalizeWordKey(word: string): string {
  return word.toLowerCase().trim();
}

// ─── Effective vocabulary pool ────────────────────────────────────────────────

/**
 * Merges built-in and custom words into a single pool where custom words
 * take priority. Any built-in word whose normalized key matches a custom word
 * is excluded — the custom entry wins.
 *
 * Use this everywhere built-in and custom words are combined so that the
 * same word never appears twice in lessons, flashcards, quizzes, or
 * practice sessions.
 */
export function getEffectiveVocab(localWords: Word[], customWords: Word[]): Word[] {
  if (customWords.length === 0) return localWords;
  const customKeys = new Set(customWords.map(w => normalizeWordKey(w.word)));
  const filteredLocal = localWords.filter(w => !customKeys.has(normalizeWordKey(w.word)));
  return [...filteredLocal, ...customWords];
}

// ─── Re-exports for convenience ───────────────────────────────────────────────
//
// Consumers that import from vocabularyService don't need to also import from
// vocabulary.ts for the most common types and helpers.

export type { Word };
export type { CEFRLevel };
export { CEFR_GROUPS };
