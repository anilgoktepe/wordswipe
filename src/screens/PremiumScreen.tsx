import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useSubscription } from '../hooks/useSubscription';
import { getTheme, spacing, radius, shadows } from '../utils/theme';
import {
  PRODUCT_IDS,
  ORDERED_PLANS,
  PLAN_META,
  type PlanMeta,
} from '../config/subscriptionProducts';

interface Props {
  navigation: any;
}

type Plan = 'monthly' | 'yearly';

// ─── Benefits list ────────────────────────────────────────────────────────────

const BENEFITS = [
  {
    icon: 'book-open-variant' as const,
    iconLib: 'mci' as const,
    title: 'Sınırsız ders uzunluğu',
    desc: '15 ve 20 kelimelik oturumlarla daha hızlı ilerle',
  },
  {
    icon: 'sparkles' as const,
    iconLib: 'ion' as const,
    title: 'Sınırsız AI analizi',
    desc: 'Her cümlen için detaylı dilbilgisi geri bildirimi al',
  },
  {
    icon: 'infinity' as const,
    iconLib: 'mci' as const,
    title: 'Sınırsız tekrar seansları',
    desc: 'Tüm öğrenilmiş kelimelerini istediğin kadar çalış',
  },
  {
    icon: 'dumbbell' as const,
    iconLib: 'mci' as const,
    title: 'Sınırsız pratik modu',
    desc: 'Cümle kurmayı tüm kelimelerle sınırsız antrenman yap',
  },
  {
    icon: 'ban' as const,
    iconLib: 'ion' as const,
    title: 'Reklamsız deneyim',
    desc: 'Hiçbir kesinti olmadan odaklanarak çalış',
  },
  {
    icon: 'trending-up' as const,
    iconLib: 'ion' as const,
    title: 'Öncelikli yeni özellikler',
    desc: 'Premium üyeler yeni özellikler ve içeriklere ilk erişir',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export const PremiumScreen: React.FC<Props> = ({ navigation }) => {
  const { state } = useApp();
  const theme     = getTheme(state.darkMode);

  const {
    products,
    isLoadingProducts,
    isPurchasing,
    isRestoring,
    purchaseError,
    restoreMessage,
    purchase,
    restorePurchases,
  } = useSubscription();

  const [selectedPlan, setSelectedPlan] = useState<Plan>('yearly');

  // ── Show purchase errors as alerts ─────────────────────────────────────────
  useEffect(() => {
    if (purchaseError) {
      Alert.alert('Satın alma başarısız', purchaseError, [{ text: 'Tamam' }]);
    }
  }, [purchaseError]);

  // ── Show restore result as alert ───────────────────────────────────────────
  useEffect(() => {
    if (restoreMessage) {
      Alert.alert('Satın alımları geri yükle', restoreMessage, [{ text: 'Tamam' }]);
    }
  }, [restoreMessage]);

  // ── Resolve store price for a plan (falls back to hardcoded if unavailable) ─
  function getDisplayPrice(planMeta: PlanMeta): string {
    const storeProduct = products.find(p => p.id === planMeta.productId);
    return storeProduct?.localizedPrice ?? planMeta.fallbackPrice;
  }

  // ── Kick off purchase for the currently selected plan ─────────────────────
  async function handlePurchase() {
    const sku = selectedPlan === 'yearly'
      ? PRODUCT_IDS.YEARLY
      : PRODUCT_IDS.MONTHLY;
    await purchase(sku);
  }

  // ── Convenience flags ─────────────────────────────────────────────────────
  const isBusy    = isPurchasing || isRestoring;
  const isPremium = state.isPremium;

  // ─── Sub-component: benefit row icon ───────────────────────────────────────
  const BenefitIcon: React.FC<{ item: typeof BENEFITS[0] }> = ({ item }) => {
    if (item.iconLib === 'ion') {
      return <Ionicons name={item.icon as any} size={20} color="#7C3AED" />;
    }
    return <MaterialCommunityIcons name={item.icon as any} size={20} color="#7C3AED" />;
  };

  // ─── Sub-component: plan card ──────────────────────────────────────────────
  const PlanCard: React.FC<{ plan: PlanMeta }> = ({ plan }) => {
    const key       = plan.key as Plan;
    const isChosen  = selectedPlan === key;
    const price     = getDisplayPrice(plan);

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setSelectedPlan(key)}
        disabled={isBusy || isPremium}
        style={[
          styles.planCard,
          {
            backgroundColor: theme.surface,
            borderColor: isChosen ? '#7C3AED' : theme.border,
            borderWidth: isChosen ? 2.5 : 1.5,
          },
          isChosen && shadows.md,
        ]}
      >
        <View style={styles.planCardTop}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text style={[styles.planName, { color: theme.text }]}>{plan.displayName}</Text>
              {plan.isPopular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>En Popüler</Text>
                </View>
              )}
            </View>
            {isLoadingProducts ? (
              <ActivityIndicator
                size="small"
                color="#7C3AED"
                style={{ marginVertical: 4, alignSelf: 'flex-start' }}
              />
            ) : (
              <Text style={[styles.planPrice, { color: '#7C3AED' }]}>{price}</Text>
            )}
            <Text style={[styles.planNote, { color: theme.textSecondary }]}>{plan.note}</Text>
          </View>
          <View style={[
            styles.radio,
            {
              borderColor: isChosen ? '#7C3AED' : theme.border,
              backgroundColor: isChosen ? '#7C3AED' : 'transparent',
            },
          ]}>
            {isChosen && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Header gradient ────────────────────────────────────────────── */}
        <LinearGradient
          colors={['#4C1D95', '#7C3AED', '#9B5CF6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.decorCircle1} />
          <View style={styles.decorCircle2} />

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>

          <View style={styles.crownWrap}>
            <MaterialCommunityIcons name="crown" size={36} color="#FCD34D" />
          </View>
          <Text style={styles.headerTitle}>WordSwipe Premium</Text>
          <Text style={styles.headerSub}>Kelime ezberleme, İngilizceyi kullan</Text>
          <Text style={styles.headerDesc}>
            Sınırsız pratik, detaylı AI analizleri ve reklamsız deneyimle daha doğru cümleler kur.
          </Text>
        </LinearGradient>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Already premium state ────────────────────────────────────── */}
          {isPremium && (
            <View style={[styles.activeBanner, { backgroundColor: '#EDE9FE', borderColor: '#7C3AED' }]}>
              <Ionicons name="checkmark-circle" size={22} color="#7C3AED" />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.activeBannerTitle}>Aboneliğiniz aktif</Text>
                <Text style={[styles.activeBannerSub, { color: theme.textSecondary }]}>
                  Tüm premium özelliklere erişebilirsiniz.
                </Text>
              </View>
            </View>
          )}

          {/* ── Benefits section ──────────────────────────────────────────── */}
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            PREMIUM İLE AÇILAN ÖZELLİKLER
          </Text>

          <View style={[styles.benefitsCard, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
            {BENEFITS.map((item, i) => (
              <View
                key={i}
                style={[
                  styles.benefitRow,
                  i < BENEFITS.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                ]}
              >
                <View style={[styles.benefitIconWrap, { backgroundColor: '#EDE9FE' }]}>
                  <BenefitIcon item={item} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.benefitTitle, { color: theme.text }]}>{item.title}</Text>
                  <Text style={[styles.benefitDesc, { color: theme.textSecondary }]}>{item.desc}</Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color="#7C3AED" />
              </View>
            ))}
          </View>

          {/* ── Plan picker (hidden when already premium) ─────────────────── */}
          {!isPremium && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: spacing.lg }]}>
                PLAN SEÇ
              </Text>

              {ORDERED_PLANS.map(plan => (
                <PlanCard key={plan.productId} plan={plan} />
              ))}
            </>
          )}

          {/* ── CTA section ───────────────────────────────────────────────── */}
          {isPremium ? (
            /* Already premium — no purchase CTA */
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation.goBack()}
              style={styles.primaryCta}
            >
              <LinearGradient
                colors={['#7C3AED', '#9B5CF6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryCtaGradient}
              >
                <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.primaryCtaText}>Geri Dön</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            /* Purchase CTA */
            <>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.primaryCta, isBusy && styles.primaryCtaDisabled]}
                onPress={handlePurchase}
                disabled={isBusy}
              >
                <LinearGradient
                  colors={isBusy ? ['#A8A4E8', '#C4B5FD'] : ['#7C3AED', '#9B5CF6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryCtaGradient}
                >
                  {isPurchasing ? (
                    <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                  ) : (
                    <MaterialCommunityIcons name="crown" size={20} color="#FCD34D" style={{ marginRight: 8 }} />
                  )}
                  <Text style={styles.primaryCtaText}>
                    {isPurchasing ? 'İşleniyor…' : 'Premium\'a Geç'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Restore button */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={restorePurchases}
                disabled={isBusy}
                style={[styles.restoreBtn, isBusy && { opacity: 0.5 }]}
              >
                {isRestoring ? (
                  <ActivityIndicator size="small" color={theme.textSecondary} />
                ) : (
                  <Text style={[styles.restoreBtnText, { color: theme.textSecondary }]}>
                    Satın alımları geri yükle
                  </Text>
                )}
              </TouchableOpacity>

              {/* Continue free */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.goBack()}
                disabled={isBusy}
                style={[styles.secondaryCta, isBusy && { opacity: 0.4 }]}
              >
                <Text style={[styles.secondaryCtaText, { color: theme.textSecondary }]}>
                  Şimdilik ücretsiz devam et
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Trust copy ────────────────────────────────────────────────── */}
          {!isPremium && (
            <View style={styles.trustRow}>
              <Ionicons name="shield-checkmark-outline" size={14} color={theme.textTertiary} />
              <Text style={[styles.trustText, { color: theme.textTertiary }]}>
                İstediğin zaman iptal edebilirsin. Ücretsiz sürüm her zaman kullanılabilir.
              </Text>
            </View>
          )}

          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  /* Header */
  header: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  decorCircle1: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -60,
    right: -60,
  },
  decorCircle2: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.04)',
    bottom: -30,
    left: -40,
  },
  backBtn: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.lg,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crownWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    fontFamily: 'Inter_800ExtraBold',
    textAlign: 'center',
    marginBottom: 6,
  },
  headerSub: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FCD34D',
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  headerDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.82)',
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 300,
  },

  /* Scroll */
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },

  /* Active premium banner */
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1.5,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  activeBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: '#7C3AED',
    marginBottom: 2,
  },
  activeBannerSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },

  /* Section label */
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    fontFamily: 'Inter_700Bold',
    marginBottom: spacing.sm,
  },

  /* Benefits card */
  benefitsCard: {
    borderRadius: radius.xl,
    borderWidth: 1.5,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
      default: {},
    }),
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    gap: spacing.md,
  },
  benefitIconWrap: {
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

  /* Plan cards */
  planCard: {
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  planCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  planName: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    marginBottom: 3,
  },
  planPrice: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'Inter_800ExtraBold',
    marginBottom: 3,
  },
  planNote: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  popularBadge: {
    backgroundColor: '#7C3AED',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  popularText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  radio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  /* CTAs */
  primaryCta: {
    borderRadius: radius.full,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  primaryCtaDisabled: {
    opacity: 0.9,
  },
  primaryCtaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: spacing.xl,
  },
  primaryCtaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'Inter_800ExtraBold',
  },
  restoreBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    minHeight: 36,
    justifyContent: 'center',
  },
  restoreBtnText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    textDecorationLine: 'underline',
  },
  secondaryCta: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  secondaryCtaText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },

  /* Trust */
  trustRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
  },
  trustText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
    flex: 1,
  },
});
