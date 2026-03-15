/**
 * useWordEnrichment
 *
 * React hook that resolves optional enrichment data (phonetic, part-of-speech,
 * definition, extra example) for a single word.
 *
 * Usage:
 *   const { enrichment, loading } = useWordEnrichment(word.word);
 *
 * - `enrichment` is null while loading or when no data is available.
 * - The hook never throws; errors result in enrichment === null.
 * - Subsequent calls with the same word are served instantly from cache.
 */

import { useState, useEffect, useRef } from 'react';
import { WordEnrichment, getWordEnrichment } from '../services/wordEnrichment';

interface UseWordEnrichmentResult {
  enrichment: WordEnrichment | null;
  loading: boolean;
}

export function useWordEnrichment(word: string): UseWordEnrichmentResult {
  const [enrichment, setEnrichment] = useState<WordEnrichment | null>(null);
  const [loading, setLoading]       = useState(false);
  const lastWord                    = useRef<string>('');

  useEffect(() => {
    if (!word || word === lastWord.current) return;
    lastWord.current = word;

    let cancelled = false;
    setEnrichment(null);
    setLoading(true);

    getWordEnrichment(word).then(result => {
      if (!cancelled) {
        setEnrichment(result);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [word]);

  return { enrichment, loading };
}
