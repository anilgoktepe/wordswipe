import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { Word } from '../data/vocabulary';
import { Button } from '../components/Button';
import { getTheme, spacing, radius, typography, shadows } from '../utils/theme';

interface Props {
  navigation: any;
}

const WordCard: React.FC<{
  word: Word;
  theme: ReturnType<typeof getTheme>;
  onRemove: () => void;
}> = ({ word, theme, onRemove }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => setExpanded(!expanded)}
      style={[
        styles.wordCard,
        { backgroundColor: theme.surface, borderColor: theme.border, ...shadows.sm },
      ]}
    >
      <View style={styles.wordCardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.english, { color: theme.text }]}>{word.englishWord}</Text>
          <Text style={[styles.turkish, { color: theme.primary }]}>{word.turkishMeaning}</Text>
        </View>
        <TouchableOpacity
          onPress={onRemove}
          style={[styles.removeBtn, { backgroundColor: theme.incorrectLight }]}
        >
          <Text style={{ color: theme.incorrect, fontSize: 14, fontWeight: '700' }}>✕</Text>
        </TouchableOpacity>
      </View>
      {expanded && (
        <View style={[styles.exampleBox, { backgroundColor: theme.surfaceSecondary }]}>
          <Text style={[styles.exampleText, { color: theme.textSecondary }]}>
            "{word.exampleSentence}"
          </Text>
        </View>
      )}
      <Text style={[styles.expandHint, { color: theme.textTertiary }]}>
        {expanded ? '▲ Gizle' : '▼ Örnek cümle'}
      </Text>
    </TouchableOpacity>
  );
};

export const DifficultWordsScreen: React.FC<Props> = ({ navigation }) => {
  const { state, dispatch, getDifficultWordObjects } = useApp();
  const theme = getTheme(state.darkMode);
  const words = getDifficultWordObjects();

  const handlePractice = () => {
    if (words.length === 0) return;
    dispatch({ type: 'SET_SESSION_WORDS', words });
    navigation.navigate('Flashcard');
  };

  const handleRemove = (wordId: number) => {
    dispatch({ type: 'REMOVE_DIFFICULT_WORD', wordId });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <LinearGradient
          colors={['#FF6584', '#F59E0B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={{ color: '#fff', fontSize: 20 }}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Zorlandıklarım</Text>
            <Text style={styles.headerSub}>
              {words.length} kelime · Pratik yaparak üstesinden gel
            </Text>
          </View>
        </LinearGradient>

        {words.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🎉</Text>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Harika! Zor kelimen yok
            </Text>
            <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
              Yanlış yaptığın kelimeler burada görünecek
            </Text>
          </View>
        ) : (
          <>
            <FlatList
              data={words}
              keyExtractor={item => item.id.toString()}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <WordCard
                  word={item}
                  theme={theme}
                  onRemove={() => handleRemove(item.id)}
                />
              )}
            />
            <View style={styles.footer}>
              <Button
                title={`Hepsini Pratik Yap (${words.length})`}
                onPress={handlePractice}
                theme={theme}
                size="lg"
                style={{ width: '100%' }}
                icon="💪"
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
  },
  headerTitle: {
    ...typography.h3,
    color: '#fff',
  },
  headerSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
    fontWeight: '600',
  },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  wordCard: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  wordCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  english: {
    ...typography.h4,
  },
  turkish: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  exampleBox: {
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  exampleText: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  expandHint: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
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
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
