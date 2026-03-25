/**
 * MonetizationModals.tsx
 *
 * Self-contained modal components for the WordSwipe freemium gate:
 *
 *   PremiumGateModal   — shown when a free user taps a premium-locked feature.
 *                        Has a clear upgrade CTA and a dismiss option.
 *
 *   AiAnalysisGateModal — shown when a free user taps "Detaylı AI Analizi Al".
 *                         Offers two paths: watch a rewarded ad (1/day) or
 *                         upgrade to Premium.  Internally shows a loading state
 *                         while the mock (or real) ad plays.
 *
 * Neither modal implements payment or ad SDKs directly.
 * The `onUpgrade` and `onWatchAd` callbacks are the integration points:
 *   • onUpgrade   → navigate to paywall / subscription screen
 *   • onWatchAd   → call showRewardedAd() from monetization.ts in the parent
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { spacing, radius } from '../utils/theme';

// ─── Shared token type (subset of the full theme, avoids circular imports) ────
export interface ModalTheme {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  primary: string;
  primaryLight: string;
}

// ─── PremiumGateModal ─────────────────────────────────────────────────────────

interface PremiumGateModalProps {
  visible: boolean;
  /** Short feature label, e.g. "20 Kelimelik Ders" */
  featureTitle: string;
  /** One-line benefit description */
  featureDescription: string;
  theme: ModalTheme;
  onClose: () => void;
  /** Navigate to paywall / subscription flow */
  onUpgrade: () => void;
}

export const PremiumGateModal: React.FC<PremiumGateModalProps> = ({
  visible,
  featureTitle,
  featureDescription,
  theme,
  onClose,
  onUpgrade,
}) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onClose}
  >
    <TouchableOpacity
      style={styles.overlay}
      activeOpacity={1}
      onPress={onClose}
    >
      {/* Tap inside the card does NOT dismiss */}
      <TouchableOpacity
        activeOpacity={1}
        style={[styles.card, { backgroundColor: theme.surface }]}
      >
        {/* Crown icon */}
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="crown" size={32} color="#F59E0B" />
        </View>

        <Text style={[styles.cardTitle, { color: theme.text }]}>
          Premium Özellik
        </Text>
        <Text style={[styles.cardFeature, { color: '#7C3AED' }]}>
          {featureTitle}
        </Text>
        <Text style={[styles.cardDesc, { color: theme.textSecondary }]}>
          {featureDescription}
        </Text>

        {/* Upgrade CTA */}
        <TouchableOpacity
          onPress={onUpgrade}
          style={styles.upgradeBtn}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="crown" size={16} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.upgradeBtnText}>Premium'a Geç</Text>
        </TouchableOpacity>

        {/* Dismiss */}
        <TouchableOpacity onPress={onClose} style={styles.dismissLink}>
          <Text style={[styles.dismissText, { color: theme.textTertiary }]}>
            Şimdi değil
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </TouchableOpacity>
  </Modal>
);

// ─── AiAnalysisGateModal ──────────────────────────────────────────────────────

interface AiAnalysisGateModalProps {
  visible: boolean;
  /** True when the user has already used their 1 free analysis today */
  isLimitReached: boolean;
  /** True while the rewarded ad is loading / playing (shows spinner) */
  isWatchingAd: boolean;
  theme: ModalTheme;
  onClose: () => void;
  /** Parent should call showRewardedAd() then notify this component via isWatchingAd */
  onWatchAd: () => void;
  /** Navigate to paywall / subscription flow */
  onUpgrade: () => void;
}

export const AiAnalysisGateModal: React.FC<AiAnalysisGateModalProps> = ({
  visible,
  isLimitReached,
  isWatchingAd,
  theme,
  onClose,
  onWatchAd,
  onUpgrade,
}) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={isWatchingAd ? undefined : onClose}
  >
    <TouchableOpacity
      style={styles.overlay}
      activeOpacity={1}
      onPress={isWatchingAd ? undefined : onClose}
    >
      <TouchableOpacity
        activeOpacity={1}
        style={[styles.card, { backgroundColor: theme.surface }]}
      >
        {/* Sparkle icon */}
        <View style={[styles.iconCircle, { backgroundColor: '#EDE9FE' }]}>
          <Ionicons name="sparkles" size={28} color="#7C3AED" />
        </View>

        <Text style={[styles.cardTitle, { color: theme.text }]}>
          Detaylı AI Analizi
        </Text>

        {/* ── Content depends on state ── */}
        {isWatchingAd ? (
          /* Loading state while ad plays */
          <View style={styles.adLoadingBox}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={[styles.adLoadingText, { color: theme.textSecondary }]}>
              Reklam yükleniyor…
            </Text>
            <Text style={[styles.adLoadingSubText, { color: theme.textTertiary }]}>
              Lütfen bekle, reklam bittikten sonra analiz başlayacak.
            </Text>
          </View>
        ) : isLimitReached ? (
          /* Limit reached state */
          <>
            <Text style={[styles.cardDesc, { color: theme.textSecondary }]}>
              Bugünkü ücretsiz AI analizi hakkını kullandın.{'\n'}
              Yarın 1 hak daha kazanırsın — ya da Premium'a geçerek sınırsız analiz yapabilirsin.
            </Text>

            <TouchableOpacity
              onPress={onUpgrade}
              style={styles.upgradeBtn}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="crown" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.upgradeBtnText}>Premium'a Geç — Sınırsız Analiz</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose} style={styles.dismissLink}>
              <Text style={[styles.dismissText, { color: theme.textTertiary }]}>
                Kapat
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          /* Normal state — offer ad or upgrade */
          <>
            <Text style={[styles.cardDesc, { color: theme.textSecondary }]}>
              Günde 1 ücretsiz detaylı AI analizi hakkın var.{'\n'}
              Reklam izleyerek bugünkü hakkını kullanabilirsin.
            </Text>

            {/* Watch Ad option */}
            <TouchableOpacity
              onPress={onWatchAd}
              style={[styles.watchAdBtn, { borderColor: '#7C3AED', backgroundColor: '#EDE9FE' }]}
              activeOpacity={0.85}
            >
              <Ionicons name="play-circle" size={18} color="#7C3AED" style={{ marginRight: 6 }} />
              <Text style={[styles.watchAdBtnText, { color: '#7C3AED' }]}>
                Reklam izle ve 1 analiz aç
              </Text>
            </TouchableOpacity>

            {/* Upgrade divider */}
            <View style={styles.orRow}>
              <View style={[styles.orLine, { backgroundColor: theme.border }]} />
              <Text style={[styles.orText, { color: theme.textTertiary }]}>veya</Text>
              <View style={[styles.orLine, { backgroundColor: theme.border }]} />
            </View>

            {/* Premium upgrade */}
            <TouchableOpacity
              onPress={onUpgrade}
              style={styles.upgradeBtn}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="crown" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.upgradeBtnText}>Premium'a Geç — Sınırsız Analiz</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose} style={styles.dismissLink}>
              <Text style={[styles.dismissText, { color: theme.textTertiary }]}>
                Şimdi değil
              </Text>
            </TouchableOpacity>
          </>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  </Modal>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    // Subtle elevation
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 16 },
      android: { elevation: 10 },
      default: {},
    }),
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  cardFeature: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: -spacing.xs,
  },
  cardDesc: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    width: '100%',
    marginTop: spacing.xs,
  },
  upgradeBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    textAlign: 'center',
  },
  watchAdBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 2,
    paddingVertical: 13,
    paddingHorizontal: spacing.xl,
    width: '100%',
  },
  watchAdBtnText: {
    fontWeight: '700',
    fontSize: 14,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
  },
  orLine: { flex: 1, height: 1 },
  orText: { fontSize: 12, fontWeight: '600' },
  dismissLink: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  dismissText: {
    fontSize: 13,
    fontWeight: '600',
  },
  adLoadingBox: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  adLoadingText: {
    fontSize: 15,
    fontWeight: '700',
  },
  adLoadingSubText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
