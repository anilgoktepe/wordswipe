/**
 * DiscoverWordsScreen
 *
 * Displays supplementary vocabulary fetched from the Free Dictionary API.
 *
 * ISOLATION GUARANTEE:
 *   - Words here come exclusively from getSupplementaryApiWords().
 *   - None of these words are passed to dispatch, wordProgress, or any SRS helper.
 *   - Favorites and saved words live in local component state only — they are
 *     intentionally ephemeral and do NOT interact with the learning engine.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { Word } from '../services/vocabularyService';
import { getTheme, radius, shadows, spacing, typography } from '../utils/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'idle' | 'loading' | 'success' | 'error';

// ─── Word card ────────────────────────────────────────────────────────────────

const DiscoverCard: React.FC<{
  word: Word;
  isFavorite: boolean;
  isSaved: boolean;
  onToggleFavorite: () => void;
  onToggleSaved: () => void;
  theme: ReturnType<typeof getTheme>;
}> = ({ word, isFavorite, isSaved, onToggleFavorite, onToggleSaved, theme }) => {
  const levelColors: Record<string, { bg: string; text: string }> = {
    easy:   { bg: '#D1FAE5', text: '#059669' },
    medium: { bg: '#FEF3C7', text: '#D97706' },
    hard:   { bg: '#FEE2E2', text: '#DC2626' },
  };
  const lvl = levelColors[word.level] ?? levelColors.easy;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.cardBorder,
          ...shadows.md,
        },
      ]}
    >
      {/* Header row: word + level badge */}
      <View style={styles.cardHeader}>
        <Text style={[styles.wordText, { color: theme.text }]}>{word.word}</Text>
        <View style={[styles.levelBadge, { backgroundColor: lvl.bg }]}>
          <Text style={[styles.levelLabel, { color: lvl.text }]}>
            {word.level.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Translation */}
      <Text style={[styles.translationText, { color: theme.primary }]}>
        {word.translation}
      </Text>

      {/* Example sentence */}
      {!!word.example && (
        <Text style={[styles.exampleText, { color: theme.textSecondary }]}>
          "{word.example}"
        </Text>
      )}

      {/* Action row */}
      <View style={[styles.actionRow, { borderTopColor: theme.border }]}>
        {/* Favorite */}
        <TouchableOpacity
          onPress={onToggleFavorite}
          activeOpacity={0.7}
          style={styles.actionBtn}
        >
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={20}
            color={isFavorite ? '#EF4444' : theme.textTertiary}
          />
          <Text
            style={[
              styles.actionLabel,
              { color: isFavorite ? '#EF4444' : theme.textTertiary },
            ]}
          >
            {isFavorite ? 'Favori' : 'Favori ekle'}
          </Text>
        </TouchableOpacity>

        {/* Save for later */}
        <TouchableOpacity
          onPress={onToggleSaved}
          activeOpacity={0.7}
          style={styles.actionBtn}
        >
          <Ionicons
            name={isSaved ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={isSaved ? theme.primary : theme.textTertiary}
          />
          <Text
            style={[
              styles.actionLabel,
              { color: isSaved ? theme.primary : theme.textTertiary },
            ]}
          >
            {isSaved ? 'Kaydedildi' : 'Sonra bak'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export const DiscoverWordsScreen: React.FC = () => {
  const { state, getSupplementaryApiWords } = useApp();
  const theme = getTheme(state.darkMode);

  // ── Local state — completely isolated from the learning engine ──────────────
  const [words, setWords]         = useState<Word[]>([]);
  const [status, setStatus]       = useState<Status>('idle');
  const [refreshing, setRefreshing] = useState(false);
  // IDs of words the user has marked as favorite (local only, never persisted)
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  // IDs of words the user saved for later (local only, never persisted)
  const [saved, setSaved]         = useState<Set<number>>(new Set());

  // ── Data fetching ───────────────────────────────────────────────────────────
  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setStatus('loading');
    }
    try {
      const result = await getSupplementaryApiWords();
      setWords(result);
      setStatus('success');
    } catch {
      setStatus('error');
    } finally {
      setRefreshing(false);
    }
  }, [getSupplementaryApiWords]);

  useEffect(() => { load(); }, [load]);

  // ── Toggle helpers ──────────────────────────────────────────────────────────
  const toggleFavorite = (id: number) =>
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSaved = (id: number) =>
    setSaved(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ── Render helpers ──────────────────────────────────────────────────────────
  const renderEmpty = () => {
    if (status === 'loading') return null;
    if (status === 'error') {
      return (
        <View style={styles.centerBox}>
          <Ionicons name="cloud-offline-outline" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Bağlantı hatası
          </Text>
          <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
            Kelimeler yüklenemedi. İnternet bağlantınızı kontrol edin.
          </Text>
          <TouchableOpacity
            onPress={() => load()}
            activeOpacity={0.8}
            style={[styles.retryBtn, { backgroundColor: theme.primary }]}
          >
            <Text style={styles.retryLabel}>Tekrar dene</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.centerBox}>
        <Ionicons name="book-outline" size={48} color={theme.textTertiary} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>
          Kelime bulunamadı
        </Text>
        <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
          Şu an görüntülenecek kelime yok.
        </Text>
      </View>
    );
  };

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View>
          <Text style={[typography.h3, { color: theme.text }]}>Keşfet</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            API'den yüklenen yeni kelimeler
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => load(false)}
          activeOpacity={0.7}
          style={[styles.refreshIconBtn, { backgroundColor: theme.primaryLight }]}
          disabled={status === 'loading'}
        >
          <Ionicons
            name="refresh"
            size={20}
            color={theme.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Favorites / saved summary strip */}
      {(favorites.size > 0 || saved.size > 0) && (
        <View style={[styles.summaryStrip, { backgroundColor: theme.primaryLight }]}>
          {favorites.size > 0 && (
            <View style={styles.summaryItem}>
              <Ionicons name="heart" size={14} color="#EF4444" />
              <Text style={[styles.summaryText, { color: theme.text }]}>
                {favorites.size} favori
              </Text>
            </View>
          )}
          {saved.size > 0 && (
            <View style={styles.summaryItem}>
              <Ionicons name="bookmark" size={14} color={theme.primary} />
              <Text style={[styles.summaryText, { color: theme.text }]}>
                {saved.size} kaydedildi
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Loading overlay */}
      {status === 'loading' && (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Kelimeler yükleniyor…
          </Text>
        </View>
      )}

      {/* Word list */}
      {status !== 'loading' && (
        <FlatList
          data={words}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
          renderItem={({ item }) => (
            <DiscoverCard
              word={item}
              isFavorite={favorites.has(item.id)}
              isSaved={saved.has(item.id)}
              onToggleFavorite={() => toggleFavorite(item.id)}
              onToggleSaved={() => toggleSaved(item.id)}
              theme={theme}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  subtitle: {
    ...typography.caption,
    marginTop: 2,
  },
  refreshIconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryStrip: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryText: {
    ...typography.small,
  },
  listContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1.5,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  wordText: {
    ...typography.h4,
    flex: 1,
  },
  levelBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  levelLabel: {
    ...typography.label,
    fontSize: 10,
  },
  translationText: {
    ...typography.bodyBold,
    marginBottom: spacing.sm,
  },
  exampleText: {
    ...typography.caption,
    fontStyle: 'italic',
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    gap: spacing.md,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionLabel: {
    ...typography.caption,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.h4,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  emptyBody: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  loadingText: {
    ...typography.caption,
    marginTop: spacing.sm,
  },
  retryBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  retryLabel: {
    ...typography.bodyBold,
    color: '#FFFFFF',
  },
});
