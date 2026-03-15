import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp, Level } from '../context/AppContext';
import { getTheme, spacing, radius, typography, shadows } from '../utils/theme';
import { clearEnrichmentCache } from '../services/wordEnrichment';

const levelLabels: Record<Level, string> = {
  easy: 'Başlangıç (A1-A2)',
  medium: 'Orta (B1-B2)',
  hard: 'İleri (C1-C2)',
};

const levelEmojis: Record<Level, string> = {
  easy: '🌱',
  medium: '🚀',
  hard: '🔥',
};

interface Props {
  navigation: any;
}

const SettingRow: React.FC<{
  icon: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  theme: ReturnType<typeof getTheme>;
  danger?: boolean;
}> = ({ icon, title, subtitle, onPress, rightElement, theme, danger }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={onPress ? 0.8 : 1}
    style={[
      styles.row,
      {
        backgroundColor: theme.surface,
        borderColor: theme.border,
        ...shadows.sm,
      },
    ]}
  >
    <View
      style={[
        styles.rowIcon,
        {
          backgroundColor: danger ? theme.incorrectLight : theme.primaryLight,
        },
      ]}
    >
      <Text style={{ fontSize: 20 }}>{icon}</Text>
    </View>
    <View style={{ flex: 1 }}>
      <Text
        style={[
          styles.rowTitle,
          { color: danger ? theme.incorrect : theme.text },
        ]}
      >
        {title}
      </Text>
      {subtitle && (
        <Text style={[styles.rowSub, { color: theme.textSecondary }]}>
          {subtitle}
        </Text>
      )}
    </View>
    {rightElement ? (
      rightElement
    ) : onPress ? (
      <Text style={{ color: theme.textTertiary, fontSize: 18 }}>›</Text>
    ) : null}
  </TouchableOpacity>
);

export const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { state, dispatch } = useApp();
  const theme = getTheme(state.darkMode);
  const [showLevelPicker, setShowLevelPicker] = useState(false);

  const handleChangeLevel = (level: Level) => {
    dispatch({ type: 'SET_LEVEL', level });
    setShowLevelPicker(false);
  };

  const handleReset = () => {
    Alert.alert(
      'İlerlemeyi Sıfırla',
      'Tüm ilerlemeniz, XP puanınız ve serileriniz silinecek. Emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sıfırla',
          style: 'destructive',
          onPress: () => {
            dispatch({ type: 'RESET_PROGRESS' });
            clearEnrichmentCache(); // also wipe optional API cache
            if (navigation && navigation.replace) {
              navigation.replace('LevelSelection');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header — no back button since this is a Tab */}
        <LinearGradient
          colors={['#6C63FF', '#9B5CF6']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={styles.headerTitle}>Ayarlar</Text>
        </LinearGradient>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {/* Profile Summary */}
          <View style={[styles.profileCard, { backgroundColor: theme.surface, ...shadows.md }]}>
            <View style={[styles.avatar, { backgroundColor: theme.primaryLight }]}>
              <Text style={{ fontSize: 32 }}>🦉</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.profileTitle, { color: theme.text }]}>
                Kelime Öğrencisi
              </Text>
              <Text style={[styles.profileSub, { color: theme.textSecondary }]}>
                {state.xp} XP · {state.streak} gün serisi · {state.learnedWordIds.length} kelime
              </Text>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            ÖĞRENME
          </Text>

          {/* Level */}
          <SettingRow
            icon={state.level ? levelEmojis[state.level] : '🎯'}
            title="Seviye"
            subtitle={state.level ? levelLabels[state.level] : 'Seçilmedi'}
            onPress={() => setShowLevelPicker(!showLevelPicker)}
            theme={theme}
          />

          {/* Level Picker */}
          {showLevelPicker && (
            <View style={[styles.levelPicker, { backgroundColor: theme.surface, borderColor: theme.border, ...shadows.md }]}>
              {(['easy', 'medium', 'hard'] as Level[]).map(lvl => (
                <TouchableOpacity
                  key={lvl}
                  onPress={() => handleChangeLevel(lvl)}
                  style={[
                    styles.levelOption,
                    {
                      backgroundColor:
                        state.level === lvl ? theme.primaryLight : 'transparent',
                      borderBottomWidth: lvl !== 'hard' ? 1 : 0,
                      borderBottomColor: theme.border,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 20, marginRight: spacing.md }}>
                    {levelEmojis[lvl]}
                  </Text>
                  <Text
                    style={[
                      styles.levelOptionText,
                      {
                        color:
                          state.level === lvl ? theme.primary : theme.text,
                      },
                    ]}
                  >
                    {levelLabels[lvl]}
                  </Text>
                  {state.level === lvl && (
                    <Text style={{ color: theme.primary, marginLeft: 'auto', fontWeight: '700' }}>
                      ✓
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            GÖRÜNÜM
          </Text>

          <SettingRow
            icon="🌙"
            title="Karanlık Mod"
            subtitle={state.darkMode ? 'Açık' : 'Kapalı'}
            theme={theme}
            rightElement={
              <Switch
                value={state.darkMode}
                onValueChange={() => dispatch({ type: 'TOGGLE_DARK_MODE' })}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor="#fff"
              />
            }
          />

          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            DESTEK
          </Text>

          <SettingRow
            icon="⭐"
            title="Uygulamayı Değerlendir"
            subtitle="App Store'da yorum bırak"
            onPress={() => {
              const url = Platform.OS === 'ios'
                ? 'https://apps.apple.com/app/id0000000000'
                : 'https://play.google.com/store/apps/details?id=com.wordswipe.app';
              Linking.openURL(url).catch(() => {});
            }}
            theme={theme}
          />

          <SettingRow
            icon="📧"
            title="Geri Bildirim Gönder"
            subtitle="Görüşlerinizi paylaşın"
            onPress={() => Linking.openURL('mailto:support@wordswipe.app').catch(() => {})}
            theme={theme}
          />

          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            VERİ
          </Text>

          <SettingRow
            icon="🗑️"
            title="İlerlemeyi Sıfırla"
            subtitle="Tüm verileriniz silinir"
            onPress={handleReset}
            theme={theme}
            danger
          />

          {/* App Info */}
          <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={{ fontSize: 32, marginBottom: spacing.sm }}>📱</Text>
            <Text style={[styles.infoTitle, { color: theme.text }]}>WordSwipe</Text>
            <Text style={[styles.infoVersion, { color: theme.textSecondary }]}>
              Versiyon 1.0.0
            </Text>
            <Text style={[styles.infoDesc, { color: theme.textTertiary }]}>
              300 kelime · 3 seviye · Made with ❤️
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  headerTitle: {
    ...typography.h3,
    color: '#fff',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileTitle: {
    ...typography.h4,
  },
  profileSub: {
    fontSize: 13,
    marginTop: 2,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    paddingLeft: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    ...typography.bodyBold,
  },
  rowSub: {
    ...typography.caption,
    marginTop: 2,
  },
  levelPicker: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  levelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  levelOptionText: {
    ...typography.bodyBold,
  },
  infoCard: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  infoTitle: {
    ...typography.h4,
  },
  infoVersion: {
    fontSize: 13,
    marginTop: 4,
  },
  infoDesc: {
    fontSize: 12,
    marginTop: 2,
  },
});
