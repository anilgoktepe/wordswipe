import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp, WordProgress } from '../context/AppContext';
import { getLocalWords, Word } from '../services/vocabularyService';
import { Button } from '../components/Button';
import { getTheme, spacing, radius, typography, shadows } from '../utils/theme';
import { FREE_SESSION_CAP } from '../utils/monetization';

const vocabulary = getLocalWords();

interface Props {
  navigation: any;
}

type FilterTab = 'all' | 'difficult' | 'learned';

// ─── User-facing classification helpers ──────────────────────────────────────
// These drive the Word Management UI. The internal SRS flags (isDifficult /
// isLearned) continue to run independently for spaced-repetition scheduling.

/**
 * ACTIVE difficult pool — used for the word-card badge and HomeScreen quick quiz.
 *
 * A word is "actively difficult" while the user has never answered it correctly.
 * The first correct answer exits the word from this state immediately.
 * Threshold: wrongCount > 0 AND correctCount === 0.
 */
function isDisplayDifficult(wp: WordProgress): boolean {
  return wp.wrongCount > 0 && wp.correctCount === 0;
}

/**
 * HISTORICAL difficult filter — used for the Word Management "Zorlu" tab.
 *
 * Any word ever answered incorrectly appears here, even after the user has
 * since recovered it.  This preserves a full history of words the user has
 * ever struggled with, separate from the active practice pool.
 * Threshold: wrongCount > 0 (regardless of correctCount).
 */
function isHistoricallyDifficult(wp: WordProgress): boolean {
  return wp.wrongCount > 0;
}

/**
 * Learned / correct filter — used for the Word Management "Öğrenildi" tab.
 *
 * A word appears here as soon as it has been answered correctly at least once.
 * This threshold is intentionally low: one correct answer is meaningful progress.
 */
function isDisplayLearned(wp: WordProgress): boolean {
  return wp.correctCount >= 1;
}

// ─── Word Card ────────────────────────────────────────────────────────────────

const WordCard: React.FC<{
  word: Word;
  progress: WordProgress;
  theme: ReturnType<typeof getTheme>;
}> = ({ word, progress, theme }) => {
  const [expanded, setExpanded] = useState(false);
  const difficult = isDisplayDifficult(progress);
  const learned   = isDisplayLearned(progress);

  const badge = difficult
    ? { label: 'Zorlu',      bg: '#FEE2E2', text: '#DC2626' }
    : learned
    ? { label: 'Öğrenildi',  bg: '#D1FAE5', text: '#059669' }
    : { label: 'Görüldü',    bg: theme.surfaceSecondary, text: theme.textSecondary };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => setExpanded(v => !v)}
      style={[
        styles.wordCard,
        {
          backgroundColor: theme.surface,
          borderColor: difficult ? '#FCA5A5' : learned ? '#6EE7B7' : theme.border,
          ...shadows.sm,
        },
      ]}
    >
      {/* Top row */}
      <View style={styles.wordCardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.english, { color: theme.text }]}>{word.word}</Text>
          <Text style={[styles.turkish, { color: theme.primary }]}>{word.translation}</Text>
        </View>

        {/* ✓ / ✗ counters */}
        <View style={styles.statsRow}>
          <View style={styles.statChip}>
            <Ionicons name="checkmark" size={12} color="#059669" />
            <Text style={[styles.statNum, { color: '#059669' }]}>{progress.correctCount}</Text>
          </View>
          <View style={styles.statChip}>
            <Ionicons name="close" size={12} color="#DC2626" />
            <Text style={[styles.statNum, { color: '#DC2626' }]}>{progress.wrongCount}</Text>
          </View>
        </View>
      </View>

      {/* Status badge + expand toggle */}
      <View style={styles.wordCardFooter}>
        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.statusText, { color: badge.text }]}>{badge.label}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={12}
            color={theme.textTertiary}
          />
          <Text style={[styles.expandHint, { color: theme.textTertiary }]}>
            {expanded ? 'Gizle' : 'Örnek cümle'}
          </Text>
        </View>
      </View>

      {expanded && (
        <View style={[styles.exampleBox, { backgroundColor: theme.surfaceSecondary }]}>
          <Text style={[styles.exampleText, { color: theme.textSecondary }]}>
            "{word.example}"
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export const DifficultWordsScreen: React.FC<Props> = ({ navigation }) => {
  const { state, dispatch } = useApp();
  const theme = getTheme(state.darkMode);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // All words that have ever been encountered in a quiz session.
  // A word enters wordProgress the first time it is answered (correctly or not).
  // Once a word is in this set it NEVER disappears — this is the permanent record.
  const seenWords     = vocabulary.filter(w => w.id in state.wordProgress);
  const difficultList = seenWords.filter(w => isHistoricallyDifficult(state.wordProgress[w.id]));
  const learnedList   = seenWords.filter(w => isDisplayLearned(state.wordProgress[w.id]));

  const displayWords =
    activeTab === 'all'       ? seenWords
    : activeTab === 'difficult' ? difficultList
    :                             learnedList;

  const isPremium = state.isPremium;

  const handlePractice = () => {
    if (displayWords.length === 0) return;

    // Premium: full word list.  Free: capped at FREE_SESSION_CAP per session.
    const max = isPremium ? displayWords.length : FREE_SESSION_CAP;

    // ── True non-repeating cycle ──────────────────────────────────────────
    //
    // `practiceSeenIds` tracks every word practiced in the current cycle.
    // Words not yet in that set are "unseen" and form the next draw pool.
    // Once the pool is fully exhausted (unseen is empty), the cycle resets
    // automatically and starts over from the full pool.
    //
    // The IDs are intersected with the CURRENT displayWords so that pool
    // changes mid-cycle (words entering/leaving) are handled naturally:
    // newly-difficult words appear immediately; graduated words disappear.
    //
    // practiceSeenIds persists in AppContext (AsyncStorage), so the cycle
    // survives navigation away and app restarts.

    const currentIds   = new Set(displayWords.map(w => w.id));
    // Only count "seen" IDs that are still part of the active pool
    const seenInPool   = new Set(state.practiceSeenIds.filter(id => currentIds.has(id)));

    const unseenWords  = displayWords.filter(w => !seenInPool.has(w.id));
    const cycleExhausted = unseenWords.length === 0;

    // If exhausted, reset and use the full pool; otherwise use what's left
    const drawPool  = cycleExhausted ? displayWords : unseenWords;
    const batchSize = Math.min(max, drawPool.length);
    const batch     = [...drawPool].sort(() => Math.random() - 0.5).slice(0, batchSize);
    const batchIds  = batch.map(w => w.id);

    // Update the seen set: reset on cycle exhaustion, otherwise accumulate
    const newSeenIds = cycleExhausted
      ? batchIds
      : [...seenInPool, ...batchIds];

    dispatch({ type: 'SET_PRACTICE_SEEN_IDS', ids: newSeenIds });
    dispatch({ type: 'SET_SESSION_WORDS', words: batch });
    navigation.navigate('Flashcard');
  };

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all',       label: 'Tümü',      count: seenWords.length     },
    { key: 'difficult', label: 'Zorlu',      count: difficultList.length },
    { key: 'learned',   label: 'Öğrenildi', count: learnedList.length   },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <LinearGradient
          colors={['#6C63FF', '#9B5CF6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Kelime Havuzu</Text>
            <Text style={styles.headerSub}>
              {seenWords.length > 0
                ? `${seenWords.length} kelime görüldü · ${difficultList.length} zorlu`
                : 'Henüz kelime görülmedi'}
            </Text>
          </View>
        </LinearGradient>

        {/* Filter Tabs */}
        <View style={[styles.tabBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          {tabs.map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[
                styles.tabBtn,
                activeTab === tab.key && {
                  borderBottomWidth: 2.5,
                  borderBottomColor: theme.primary,
                },
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: activeTab === tab.key ? theme.primary : theme.textSecondary },
                ]}
              >
                {tab.label}
              </Text>
              <View
                style={[
                  styles.tabCount,
                  {
                    backgroundColor:
                      activeTab === tab.key ? theme.primaryLight : theme.surfaceSecondary,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabCountText,
                    { color: activeTab === tab.key ? theme.primary : theme.textTertiary },
                  ]}
                >
                  {tab.count}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Empty states */}
        {seenWords.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📚</Text>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Henüz kelime görmedin
            </Text>
            <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
              Derslerini tamamlayınca kelimeler burada görünecek
            </Text>
          </View>
        ) : displayWords.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>
              {activeTab === 'difficult' ? '🎉' : '📖'}
            </Text>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {activeTab === 'difficult'
                ? 'Harika! Zor kelimen yok'
                : 'Henüz öğrenilmiş kelime yok'}
            </Text>
            <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
              {activeTab === 'difficult'
                ? 'Yanlış yaptığın kelimeler burada görünecek'
                : 'Bir kelimeyi doğru yanıtlayınca burada görünecek'}
            </Text>
          </View>
        ) : (
          <>
            <FlatList
              data={displayWords}
              keyExtractor={item => item.id.toString()}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              style={styles.flatList}
              renderItem={({ item }) => (
                <WordCard
                  word={item}
                  progress={state.wordProgress[item.id]}
                  theme={theme}
                />
              )}
            />
            <View style={styles.footer}>
              <Button
                title={`Pratik Yap (${isPremium ? displayWords.length : Math.min(displayWords.length, FREE_SESSION_CAP)})`}
                onPress={handlePractice}
                theme={theme}
                size="lg"
                style={{ width: '100%' }}
                icon={<MaterialCommunityIcons name="dumbbell" size={20} color="#fff" />}
              />
            </View>
          </>
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 20,
  },
  headerTitle: {
    ...typography.h3,
    color: '#fff',
    fontFamily: 'Inter_700Bold',
  },
  headerSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 2,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },

  /* Filter Tabs */
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  tabCount: {
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },

  /* List */
  flatList: { flex: 1 },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },

  /* Word Card */
  wordCard: {
    borderRadius: radius.xl,
    borderWidth: 2,
    padding: spacing.md,
  },
  wordCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  english: {
    ...typography.h4,
    fontFamily: 'Inter_700Bold',
  },
  turkish: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
    fontFamily: 'Inter_600SemiBold',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    marginRight: spacing.xs,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: 'transparent',
  },
  statNum: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  wordCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  expandHint: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  exampleBox: {
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  exampleText: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
  },

  /* Footer */
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },

  /* Empty states */
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyEmoji: { fontSize: 64, marginBottom: spacing.lg },
  emptyTitle: {
    ...typography.h3,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptySub: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
  },
});
