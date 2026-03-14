import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp, Level } from '../context/AppContext';
import { Button } from '../components/Button';
import { getTheme, spacing, radius, typography, shadows } from '../utils/theme';

const { width } = Dimensions.get('window');

const levels: {
  key: Level;
  label: string;
  range: string;
  description: string;
  emoji: string;
  gradient: string[];
}[] = [
  {
    key: 'easy',
    label: 'Başlangıç',
    range: 'A1-A2',
    description: 'Temel günlük kelimeler',
    emoji: '🌱',
    gradient: ['#43D99D', '#38BDF8'],
  },
  {
    key: 'medium',
    label: 'Orta',
    range: 'B1-B2',
    description: 'Daha gelişmiş kelimeler',
    emoji: '🚀',
    gradient: ['#6C63FF', '#9B5CF6'],
  },
  {
    key: 'hard',
    label: 'İleri',
    range: 'C1-C2',
    description: 'Akademik ve zor kelimeler',
    emoji: '🔥',
    gradient: ['#FF6584', '#F59E0B'],
  },
];

interface Props {
  navigation: any;
}

export const LevelSelectionScreen: React.FC<Props> = ({ navigation }) => {
  const { state, dispatch } = useApp();
  const theme = getTheme(state.darkMode);
  const [selected, setSelected] = useState<Level | null>(null);

  const handleConfirm = () => {
    if (!selected) return;
    dispatch({ type: 'SET_LEVEL', level: selected });
    navigation.replace('Main');
  };

  return (
    <LinearGradient
      colors={[theme.background, theme.surfaceSecondary]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>
            İngilizce seviyeni seç
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Sana uygun kelimeleri gösterebilmemiz için seviyeni seç.
          </Text>
        </View>

        <View style={styles.cards}>
          {levels.map((lvl, idx) => {
            const isSelected = selected === lvl.key;
            return (
              <TouchableOpacity
                key={lvl.key}
                activeOpacity={0.85}
                onPress={() => setSelected(lvl.key)}
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.surface,
                    borderColor: isSelected ? lvl.gradient[0] : theme.border,
                    borderWidth: isSelected ? 2.5 : 1.5,
                    ...shadows.md,
                    transform: [{ scale: isSelected ? 1.02 : 1 }],
                  },
                ]}
              >
                <LinearGradient
                  colors={isSelected ? (lvl.gradient as [string, string]) : [theme.surfaceSecondary, theme.surfaceSecondary]}
                  style={styles.emojiBg}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={styles.emoji}>{lvl.emoji}</Text>
                </LinearGradient>

                <View style={styles.cardContent}>
                  <View>
                    <Text style={[styles.levelLabel, { color: theme.text }]}>
                      {lvl.label}
                    </Text>
                    <Text style={[styles.levelDescription, { color: theme.textSecondary }]}>
                      {lvl.description}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: isSelected
                          ? lvl.gradient[0] + '20'
                          : theme.surfaceSecondary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        { color: isSelected ? lvl.gradient[0] : theme.textSecondary },
                      ]}
                    >
                      {lvl.range}
                    </Text>
                  </View>
                </View>

                {isSelected && (
                  <View style={[styles.checkmark, { backgroundColor: lvl.gradient[0] }]}>
                    <Text style={styles.checkmarkText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.footer}>
          <Button
            title="Başla"
            onPress={handleConfirm}
            disabled={!selected}
            theme={theme}
            size="lg"
            style={styles.button}
          />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: spacing.lg },
  header: {
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  title: {
    ...typography.h1,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    lineHeight: 24,
  },
  cards: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  emojiBg: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 28 },
  cardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  levelLabel: {
    ...typography.h4,
    marginBottom: 2,
  },
  levelDescription: {
    ...typography.caption,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  badgeText: {
    ...typography.small,
    fontWeight: '700',
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  footer: {
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
  },
  button: { width: '100%' },
});
