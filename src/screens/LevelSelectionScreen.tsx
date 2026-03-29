/**
 * src/screens/LevelSelectionScreen.tsx
 *
 * First-time onboarding flow.  Shown only when state.level is null (first launch).
 * Once level is confirmed, it is persisted and this screen never appears again.
 *
 * ─── Step structure ────────────────────────────────────────────────────────────
 *   Step 0 — Welcome / value proposition
 *   Step 1 — How it works (3 illustrated steps)
 *   Step 2 — Level selection (sets state.level → gates the whole app)
 *
 * No new routes, no new AsyncStorage keys, no new AppState fields needed.
 * Completion is naturally gated by state.level being set — the navigator
 * already sends first-timers here (level === null) and never again after.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp, Level } from '../context/AppContext';
import { Button } from '../components/Button';
import { getTheme, spacing, radius, shadows } from '../utils/theme';

const { width } = Dimensions.get('window');
const TOTAL_STEPS = 3;

// ─── Level data (unchanged) ───────────────────────────────────────────────────

function LevelIcon({ levelKey, size = 28 }: { levelKey: Level; size?: number }) {
  if (levelKey === 'easy')   return <MaterialCommunityIcons name="sprout" size={size} color="#fff" />;
  if (levelKey === 'medium') return <MaterialCommunityIcons name="rocket" size={size} color="#fff" />;
  return <MaterialCommunityIcons name="fire" size={size} color="#fff" />;
}

const LEVELS: { key: Level; label: string; range: string; description: string; gradient: [string, string] }[] = [
  { key: 'easy',   label: 'Başlangıç', range: 'A1-A2', description: 'Temel günlük kelimeler',   gradient: ['#43D99D', '#38BDF8'] },
  { key: 'medium', label: 'Orta',      range: 'B1-B2', description: 'Daha gelişmiş kelimeler',  gradient: ['#6C63FF', '#9B5CF6'] },
  { key: 'hard',   label: 'İleri',     range: 'C1-C2', description: 'Akademik ve zor kelimeler', gradient: ['#FF6584', '#F59E0B'] },
];

// ─── Onboarding data ──────────────────────────────────────────────────────────

const BENEFITS = [
  {
    iconLib: 'ion' as const,
    icon: 'flash' as const,
    color: '#F59E0B',
    bg: '#FEF3C7',
    title: 'Günlük yeni kelimeler',
    desc: 'Seviyen için seçilmiş flash kartlarla hızlıca öğren',
  },
  {
    iconLib: 'mci' as const,
    icon: 'pencil-outline' as const,
    color: '#7C3AED',
    bg: '#EDE9FE',
    title: 'Cümle yaz, AI analiz et',
    desc: 'Öğrendiklerini gerçek cümlelerle pekiştir, hatalarını öğren',
  },
  {
    iconLib: 'ion' as const,
    icon: 'trending-up' as const,
    color: '#10B981',
    bg: '#D1FAE5',
    title: 'İlerlemeni takip et',
    desc: 'Seri, XP ve istatistiklerle motive kal',
  },
];

const HOW_IT_WORKS = [
  {
    num: '1',
    gradient: ['#43D99D', '#38BDF8'] as [string, string],
    title: 'Kartı çevir',
    desc: 'Kelimeyi gör, anlamını öğren. Biliyorsan ilerle, bilmiyorsan tekrar gör.',
  },
  {
    num: '2',
    gradient: ['#6C63FF', '#9B5CF6'] as [string, string],
    title: 'Cümle kur',
    desc: 'Öğrendiğin kelimeyi kullanarak kendi cümleni yaz. Pratik yapmak en iyi öğrenme yöntemi.',
  },
  {
    num: '3',
    gradient: ['#FF6584', '#F59E0B'] as [string, string],
    title: 'AI feedback al',
    desc: 'Dilbilgisi ve doğallık hatalarını anında öğren. Premium\'da sınırsız, ücretsizde günde 3 kez.',
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  navigation: any;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const LevelSelectionScreen: React.FC<Props> = ({ navigation }) => {
  const { state, dispatch } = useApp();
  const theme = getTheme(state.darkMode);
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<Level | null>(null);

  const isLastStep   = step === TOTAL_STEPS - 1;
  const buttonTitle  = isLastStep ? 'Hadi Başlayalım! 🚀' : 'Devam Et';
  const buttonDisabled = isLastStep && !selected;

  const handleNext = () => {
    if (!isLastStep) {
      setStep(s => s + 1);
      return;
    }
    if (!selected) return;
    dispatch({ type: 'SET_LEVEL', level: selected });
    navigation.replace('Main');
  };

  const handleBack = () => {
    if (step > 0) setStep(s => s - 1);
  };

  return (
    <LinearGradient
      colors={[theme.background, theme.surfaceSecondary]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safe}>

        {/* ── Step indicator ────────────────────────────────────────────── */}
        <View style={styles.stepRow}>
          {step > 0 ? (
            <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
              <Text style={[styles.backText, { color: theme.textSecondary }]}>Geri</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.stepSpacer} />
          )}

          <View style={styles.dots}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === step
                    ? { backgroundColor: '#7C3AED', width: 20, borderRadius: 4 }
                    : { backgroundColor: theme.border },
                ]}
              />
            ))}
          </View>

          <View style={styles.stepSpacer} />
        </View>

        {/* ── Scrollable content ────────────────────────────────────────── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 0 && <WelcomeStep theme={theme} />}
          {step === 1 && <HowItWorksStep theme={theme} />}
          {step === 2 && (
            <LevelSelectStep
              theme={theme}
              selected={selected}
              onSelect={setSelected}
            />
          )}
        </ScrollView>

        {/* ── Fixed footer CTA ──────────────────────────────────────────── */}
        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <Button
            title={buttonTitle}
            onPress={handleNext}
            disabled={buttonDisabled}
            theme={theme}
            size="lg"
            style={styles.button}
          />
          {step === 0 && (
            <Text style={[styles.freeLine, { color: theme.textTertiary }]}>
              Ücretsiz başla · İstediğinde premium'a geç
            </Text>
          )}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

// ─── Step 0: Welcome ──────────────────────────────────────────────────────────

const WelcomeStep: React.FC<{ theme: ReturnType<typeof getTheme> }> = ({ theme }) => (
  <View style={stepStyles.wrapper}>
    {/* Header gradient card */}
    <LinearGradient
      colors={['#4C1D95', '#7C3AED', '#9B5CF6']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={stepStyles.welcomeCard}
    >
      <View style={stepStyles.decorCircle1} />
      <View style={stepStyles.decorCircle2} />

      <View style={stepStyles.crownWrap}>
        <MaterialCommunityIcons name="crown" size={36} color="#FCD34D" />
      </View>
      <Text style={stepStyles.welcomeTitle}>WordSwipe'a{'\n'}Hoş Geldin</Text>
      <Text style={stepStyles.welcomeSub}>
        İngilizce kelime öğrenmenin en akıllı yolu
      </Text>
    </LinearGradient>

    {/* Benefit rows */}
    <View style={[stepStyles.benefitCard, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
      {BENEFITS.map((b, i) => (
        <View
          key={i}
          style={[
            stepStyles.benefitRow,
            i < BENEFITS.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
          ]}
        >
          <View style={[stepStyles.benefitIcon, { backgroundColor: b.bg }]}>
            {b.iconLib === 'ion'
              ? <Ionicons name={b.icon as any} size={20} color={b.color} />
              : <MaterialCommunityIcons name={b.icon as any} size={20} color={b.color} />
            }
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[stepStyles.benefitTitle, { color: theme.text }]}>{b.title}</Text>
            <Text style={[stepStyles.benefitDesc, { color: theme.textSecondary }]}>{b.desc}</Text>
          </View>
        </View>
      ))}
    </View>
  </View>
);

// ─── Step 1: How It Works ─────────────────────────────────────────────────────

const HowItWorksStep: React.FC<{ theme: ReturnType<typeof getTheme> }> = ({ theme }) => (
  <View style={stepStyles.wrapper}>
    <View style={stepStyles.stepHeader}>
      <Text style={[stepStyles.stepTitle, { color: theme.text }]}>Nasıl Çalışır?</Text>
      <Text style={[stepStyles.stepSubtitle, { color: theme.textSecondary }]}>
        3 adımda İngilizce kelime öğren
      </Text>
    </View>

    <View style={stepStyles.howCards}>
      {HOW_IT_WORKS.map((item, i) => (
        <View
          key={i}
          style={[stepStyles.howCard, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}
        >
          <LinearGradient
            colors={item.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={stepStyles.howNum}
          >
            <Text style={stepStyles.howNumText}>{item.num}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[stepStyles.howTitle, { color: theme.text }]}>{item.title}</Text>
            <Text style={[stepStyles.howDesc, { color: theme.textSecondary }]}>{item.desc}</Text>
          </View>
        </View>
      ))}
    </View>
  </View>
);

// ─── Step 2: Level Selection ──────────────────────────────────────────────────

interface LevelSelectStepProps {
  theme: ReturnType<typeof getTheme>;
  selected: Level | null;
  onSelect: (level: Level) => void;
}

const LevelSelectStep: React.FC<LevelSelectStepProps> = ({ theme, selected, onSelect }) => (
  <View style={stepStyles.wrapper}>
    <View style={stepStyles.stepHeader}>
      <Text style={[stepStyles.stepTitle, { color: theme.text }]}>
        Seviyeni Seç
      </Text>
      <Text style={[stepStyles.stepSubtitle, { color: theme.textSecondary }]}>
        Sana uygun kelimeleri gösterebilmemiz için seviyeni seç.
      </Text>
    </View>

    <View style={stepStyles.levelCards}>
      {LEVELS.map(lvl => {
        const isChosen = selected === lvl.key;
        return (
          <TouchableOpacity
            key={lvl.key}
            activeOpacity={0.85}
            onPress={() => onSelect(lvl.key)}
            style={[
              stepStyles.levelCard,
              {
                backgroundColor: theme.surface,
                borderColor: isChosen ? lvl.gradient[0] : theme.border,
                borderWidth: isChosen ? 2.5 : 1.5,
                transform: [{ scale: isChosen ? 1.02 : 1 }],
              },
              shadows.md,
            ]}
          >
            <LinearGradient
              colors={isChosen ? lvl.gradient : [theme.surfaceSecondary, theme.surfaceSecondary]}
              style={stepStyles.levelIconBg}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <LevelIcon levelKey={lvl.key} size={28} />
            </LinearGradient>

            <View style={stepStyles.levelContent}>
              <View>
                <Text style={[stepStyles.levelLabel, { color: theme.text }]}>{lvl.label}</Text>
                <Text style={[stepStyles.levelDesc,  { color: theme.textSecondary }]}>{lvl.description}</Text>
              </View>
              <View style={[
                stepStyles.badge,
                { backgroundColor: isChosen ? lvl.gradient[0] + '20' : theme.surfaceSecondary },
              ]}>
                <Text style={[stepStyles.badgeText, { color: isChosen ? lvl.gradient[0] : theme.textSecondary }]}>
                  {lvl.range}
                </Text>
              </View>
            </View>

            {isChosen && (
              <View style={[stepStyles.checkmark, { backgroundColor: lvl.gradient[0] }]}>
                <Ionicons name="checkmark" size={14} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe:      { flex: 1 },

  /* Step indicator row */
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 60,
  },
  backText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  stepSpacer: { minWidth: 60 },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  /* Scroll */
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },

  /* Fixed footer */
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.md : spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  button: { width: '100%' },
  freeLine: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
});

const stepStyles = StyleSheet.create({
  wrapper: {
    gap: spacing.lg,
  },

  /* Welcome card */
  welcomeCard: {
    borderRadius: radius.xl,
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#6C63FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
      android: { elevation: 6 },
      default: {},
    }),
  },
  decorCircle1: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top: -50,
    right: -50,
  },
  decorCircle2: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.04)',
    bottom: -30,
    left: -30,
  },
  crownWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  welcomeTitle: {
    fontSize: 26,
    fontWeight: '800',
    fontFamily: 'Inter_800ExtraBold',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 8,
  },
  welcomeSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.80)',
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },

  /* Benefit card */
  benefitCard: {
    borderRadius: radius.xl,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    gap: spacing.md,
  },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  benefitTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    marginBottom: 2,
  },
  benefitDesc: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
  },

  /* How it works */
  stepHeader: {
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  stepTitle: {
    fontSize: 26,
    fontWeight: '800',
    fontFamily: 'Inter_800ExtraBold',
    lineHeight: 32,
  },
  stepSubtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
  howCards: {
    gap: spacing.md,
  },
  howCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    padding: spacing.md,
  },
  howNum: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  howNumText: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'Inter_800ExtraBold',
    color: '#fff',
  },
  howTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    marginBottom: 4,
  },
  howDesc: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 19,
  },

  /* Level selection */
  levelCards: {
    gap: spacing.md,
  },
  levelCard: {
    borderRadius: radius.xl,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 80,
  },
  levelIconBg: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  levelLabel: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    marginBottom: 2,
  },
  levelDesc: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
