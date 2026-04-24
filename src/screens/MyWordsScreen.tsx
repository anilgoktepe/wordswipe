import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { Word } from '../data/vocabulary';
import { getTheme, spacing, radius, typography, shadows } from '../utils/theme';

interface Props {
  navigation: any;
}

const LEVEL_BADGE: Record<string, { label: string; color: string }> = {
  easy:   { label: 'Kolay',  color: '#10B981' },
  medium: { label: 'Orta',   color: '#F59E0B' },
  hard:   { label: 'Zor',    color: '#EF4444' },
};

function WordCard({
  word,
  theme,
  onDelete,
}: {
  word: Word;
  theme: ReturnType<typeof getTheme>;
  onDelete: () => void;
}) {
  const badge = LEVEL_BADGE[word.level] ?? LEVEL_BADGE.medium;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.cardBorder }, shadows.sm]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={[styles.wordEn, { color: theme.text }]}>{word.word}</Text>
          <View style={[styles.badge, { backgroundColor: badge.color + '20', borderColor: badge.color }]}>
            <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.wordTr, { color: theme.textSecondary }]}>{word.translation}</Text>

      {word.example ? (
        <Text style={[styles.example, { color: theme.textTertiary }]} numberOfLines={2}>
          "{word.example}"
        </Text>
      ) : null}

    </View>
  );
}

export const MyWordsScreen: React.FC<Props> = ({ navigation }) => {
  const { state, dispatch } = useApp();
  const theme = getTheme(state.darkMode);

  const handleDelete = (word: Word) => {
    Alert.alert(
      'Kelimeyi sil',
      `"${word.word}" kelimesini listenden kaldırmak istiyor musun?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => dispatch({ type: 'DELETE_CUSTOM_WORD', wordId: word.id }),
        },
      ],
    );
  };

  const sorted = [...state.customWords].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Kelimelerim</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: theme.primary }]}
          onPress={() => navigation.navigate('AddWord')}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.addBtnText}>Ekle</Text>
        </TouchableOpacity>
      </View>

      {sorted.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bookmark-outline" size={56} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Henüz kelime eklemedin</Text>
          <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
            Dışarıda karşılaştığın İngilizce kelimeleri buraya ekle.{'\n'}
            Öğrenme akışında otomatik olarak karşına çıkarız.
          </Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: theme.primary }]}
            onPress={() => navigation.navigate('AddWord')}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.emptyBtnText}>İlk kelimeni ekle</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={[styles.count, { color: theme.textSecondary }]}>
            {sorted.length} kelime · En yeni en üstte
          </Text>
          <FlatList
            data={sorted}
            keyExtractor={w => String(w.id)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <WordCard
                word={item}
                theme={theme}
                onDelete={() => handleDelete(item)}
              />
            )}
          />
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: { ...typography.h2, fontWeight: '700' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  count: {
    ...typography.caption,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xl * 3,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
    flex: 1,
  },
  wordEn: { ...typography.h3, fontWeight: '700' },
  wordTr: { ...typography.body, fontWeight: '500' },
  example: { ...typography.caption, fontStyle: 'italic', lineHeight: 18 },
  badge: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  deleteBtn: { padding: 4 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: { ...typography.h3, fontWeight: '700', textAlign: 'center' },
  emptyDesc: { ...typography.body, textAlign: 'center', lineHeight: 22 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
    marginTop: spacing.sm,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
