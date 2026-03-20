import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp, Level } from '../context/AppContext';
import { Button } from '../components/Button';
import { getTheme, spacing, radius, typography, shadows } from '../utils/theme';

const { width } = Dimensions.get('window');

/** Renders the level icon as a vector icon (always white, shown on gradient bg). */
function LevelIcon({ levelKey, size = 28 }: { levelKey: Level; size?: number }) {
  if (levelKey === 'easy')   return <MaterialCommunityIcons name="sprout"  size={size} color="#fff" />;
  if (levelKey === 'medium') return <MaterialCommunityIcons name="rocket"  size={size} color="#fff" />;
  return <MaterialCommunityIcons name="fire" size={size} color="#fff" />;
}

const levels: {
  key: Level;
  label: string;
  range: string;
  description: string;
  gradient: string[];
}[] = [
  {
    key: 'easy',
    label: 'Başlangıç',
    range: 'A1-A2',
    description: 'Temel günlük kelimeler',
    gradient: ['#43D99D', '#38BDF8'],
  },
  {
    key: 'medium',
    label: 'Orta',
    range: 'B1-B2',
    description: 'Daha gelişmiş kelimeler',
    gradient: ['#6C63FF', '#9B5CF6'],
  },
  {
    key: 'hard',
    label: 'İleri',
    range: 'C1-C2',
    description: 'Akademik ve zor kelimeler',
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
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
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
                    transform: [{ scale: isSelected ? 1.03 : 1 }],
                  },
                ]}
              >
                <LinearGradient
                  colors={isSelected ? (lvl.gradient as [string, string]) : [theme.surfaceSecondary, theme.surfaceSecondary]}
                  style={styles.emojiBg}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <LevelIcon levelKey={lvl.key} size={32} />
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
                    <Ionicons name="checkmark" size={14} color="#fff" />
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
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
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
    gap: spacing.md,
  },
  card: {
    borderRadius: radius.xl,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 80,
  },
  emojiBg: {
    width: 66,
    height: 66,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  levelLabel: {
    ...typography.h4,
    marginBottom: 2,
    fontFamily: 'Inter_700Bold',
  },
  levelDescription: {
    ...typography.caption,
    fontFamily: 'Inter_500Medium',
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
  footer: {
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
  },
  button: { width: '100%' },
});
