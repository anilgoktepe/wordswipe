/**
 * translationService.ts
 *
 * Client-side translation helper for AddWordScreen.
 *
 * Calls the backend proxy at /api/translate instead of a public API directly.
 * The DeepL key never leaves the server.
 *
 * Returns null on any failure — the caller falls back to manual entry.
 *
 * ─── URL resolution ───────────────────────────────────────────────────────────
 *
 *   Backend URL comes from API_BASE_URL in src/config/apiConfig.ts.
 *   Set EXPO_PUBLIC_API_URL in .env to override for real-device / production.
 *   See apiConfig.ts for the full resolution rules.
 */

import { API_BASE_URL } from '../config/apiConfig';

export async function translateWord(
  text: string,
  from: 'en' | 'tr',
  to: 'en' | 'tr',
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 2) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`${API_BASE_URL}/api/translate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text: trimmed, from, to }),
      signal:  controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json() as { translation?: string };
    const translation = data.translation?.trim();

    if (!translation) return null;
    if (translation.toLowerCase() === trimmed.toLowerCase()) return null;

    return translation;
  } catch {
    return null;
  }
}
