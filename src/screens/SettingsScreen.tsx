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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp, Level } from '../context/AppContext';
import { getLocalWords } from '../services/vocabularyService';
import { getTheme, spacing, radius, typography, shadows } from '../utils/theme';
import { clearEnrichmentCache } from '../services/wordEnrichment';
import { pickChallengeWord, buildChallengeContent } from '../services/curiosityNotification';

const vocabulary = getLocalWords();

const levelLabels: Record<Level, string> = {
  easy: 'Başlangıç (A1-A2)',
  medium: 'Orta (B1-B2)',
  hard: 'İleri (C1-C2)',
};

/** Maps a difficulty level to a vector icon (used in the level picker and setting row). */
function LevelIcon({ levelKey, size = 20 }: { levelKey: Level; size?: number }) {
  if (levelKey === 'easy')   return <MaterialCommunityIcons name="sprout" size={size} color="#43D99D" />;
  if (levelKey === 'medium') return <MaterialCommunityIcons name="rocket" size={size} color="#6C63FF" />;
  return <MaterialCommunityIcons name="fire" size={size} color="#EF4444" />;
}

interface Props {
  navigation: any;
}

const SettingRow: React.FC<{
  icon: React.ReactNode;
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
          borderWidth: 1.5,
          borderColor: danger
            ? (theme.incorrect + '40')
            : (theme.primary + '30'),
        },
      ]}
    >
      {icon}
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
      <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
    ) : null}
  </TouchableOpacity>
);

export const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { state, dispatch } = useApp();
  const theme = getTheme(state.darkMode);
  const [showLevelPicker, setShowLevelPicker] = useState(false);
  const [testNotifStatus, setTestNotifStatus] = useState<'idle' | 'sent' | 'unsupported' | 'denied'>('idle');

  const handleTestNotification = async () => {
    // Build notification content (shared between web and native)
    const challengeWord = pickChallengeWord(state);
    let title: string;
    let body: string;
    if (challengeWord) {
      const content = buildChallengeContent(challengeWord);
      title = content.title;
      body  = content.body;
    } else {
      title = 'WordSwipe';
      body  = "Do you know what 'reluctant' means?";
    }

    // ── Web path: use browser Notification API ─────────────────────────────
    if (Platform.OS === 'web') {
      if (!('Notification' in window)) {
        setTestNotifStatus('unsupported');
        setTimeout(() => setTestNotifStatus('idle'), 3000);
        return;
      }

      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        setTestNotifStatus('denied');
        setTimeout(() => setTestNotifStatus('idle'), 3000);
        return;
      }

      new Notification(title, { body, icon: '/favicon.ico' });
      setTestNotifStatus('sent');
      setTimeout(() => setTestNotifStatus('idle'), 4000);
      return;
    }

    // ── Native path: use expo-notifications ────────────────────────────────
    try {
      const Notif = await import('expo-notifications');

      // Request permission if not already granted
      let { status } = await Notif.getPermissionsAsync();
      if (status !== 'granted') {
        const result = await Notif.requestPermissionsAsync();
        status = result.status;
      }
      if (status !== 'granted') {
        Alert.alert(
          'İzin Gerekli',
          'Bildirim göndermek için lütfen ayarlardan bildirim iznini etkinleştirin.',
          [{ text: 'Tamam' }],
        );
        return;
      }

      // Fire after 3 seconds so the user has time to read the confirmation
      await Notif.scheduleNotificationAsync({
        content: { title, body, sound: true },
        trigger: {
          type:    Notif.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 3,
          repeats: false,
        },
      });

      setTestNotifStatus('sent');
      setTimeout(() => setTestNotifStatus('idle'), 4000);
    } catch (_) {
      Alert.alert('Hata', 'Bildirim gönderilemedi.');
    }
  };

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
            <View style={[styles.avatar, { backgroundColor: theme.primaryLight, borderColor: theme.primary + '40' }]}>
              <Text style={{ fontSize: 32 }}>🦉</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.profileTitle, { color: theme.text }]}>
                Kelime Öğrencisi
              </Text>
              <Text style={[styles.profileSub, { color: theme.textSecondary }]}>
                {state.xp} XP · {state.streak} gün serisi · {Object.values(state.wordProgress).filter(p => p.correctCount >= 2).length} kelime
              </Text>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            ÖĞRENME
          </Text>

          {/* Level */}
          <SettingRow
            icon={state.level
              ? <LevelIcon levelKey={state.level} size={20} />
              : <MaterialCommunityIcons name="target" size={20} color={theme.primary} />
            }
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
                  <View style={{ marginRight: spacing.md }}>
                    <LevelIcon levelKey={lvl} size={20} />
                  </View>
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
                    <Ionicons name="checkmark" size={18} color={theme.primary} style={{ marginLeft: 'auto' as any }} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            GÖRÜNÜM
          </Text>

          <SettingRow
            icon={<MaterialCommunityIcons name="moon-waning-crescent" size={20} color={theme.primary} />}
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
            icon={<Ionicons name="star" size={20} color={theme.primary} />}
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
            icon={<MaterialCommunityIcons name="email-outline" size={20} color={theme.primary} />}
            title="Geri Bildirim Gönder"
            subtitle="Görüşlerinizi paylaşın"
            onPress={() => Linking.openURL('mailto:support@wordswipe.app').catch(() => {})}
            theme={theme}
          />

          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            TEST
          </Text>

          <SettingRow
            icon={<Ionicons name="notifications-outline" size={20} color={theme.primary} />}
            title="Test Bildirimi"
            subtitle="3 saniye içinde örnek bir bildirim gönderir"
            onPress={handleTestNotification}
            theme={theme}
          />
          {testNotifStatus === 'sent' && (
            <View style={[styles.toastBanner, { backgroundColor: theme.correctLight, borderColor: theme.correct }]}>
              <Ionicons name="checkmark-circle" size={16} color={theme.correct} style={{ marginRight: 6 }} />
              <Text style={{ color: theme.correct, fontWeight: '700', fontSize: 13 }}>
                Test bildirimi gönderildi.
              </Text>
            </View>
          )}
          {testNotifStatus === 'unsupported' && (
            <View style={[styles.toastBanner, { backgroundColor: theme.incorrectLight, borderColor: theme.incorrect }]}>
              <Ionicons name="close-circle" size={16} color={theme.incorrect} style={{ marginRight: 6 }} />
              <Text style={{ color: theme.incorrect, fontWeight: '700', fontSize: 13 }}>
                Tarayıcınız bildirimleri desteklemiyor.
              </Text>
            </View>
          )}
          {testNotifStatus === 'denied' && (
            <View style={[styles.toastBanner, { backgroundColor: theme.incorrectLight, borderColor: theme.incorrect }]}>
              <Ionicons name="close-circle" size={16} color={theme.incorrect} style={{ marginRight: 6 }} />
              <Text style={{ color: theme.incorrect, fontWeight: '700', fontSize: 13 }}>
                Bildirim izni reddedildi. Tarayıcı ayarlarından izin verin.
              </Text>
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            VERİ
          </Text>

          <SettingRow
            icon={<MaterialCommunityIcons name="delete-outline" size={20} color={theme.incorrect} />}
            title="İlerlemeyi Sıfırla"
            subtitle="Tüm verileriniz silinir"
            onPress={handleReset}
            theme={theme}
            danger
          />

          {/* App Info */}
          <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="cellphone" size={32} color={theme.primary} style={{ marginBottom: spacing.sm }} />
            <Text style={[styles.infoTitle, { color: theme.text }]}>WordSwipe</Text>
            <Text style={[styles.infoVersion, { color: theme.textSecondary }]}>
              Versiyon 1.0.0
            </Text>
            <Text style={[styles.infoDesc, { color: theme.textTertiary }]}>
              {vocabulary.length} kelime · 3 seviye · Made with ❤️
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
    flexGrow: 1,
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
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  profileTitle: {
    ...typography.h4,
    fontFamily: 'Inter_700Bold',
  },
  profileSub: {
    fontSize: 13,
    marginTop: 2,
    fontWeight: '500',
    fontFamily: 'Inter_500Medium',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    paddingLeft: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    ...typography.bodyBold,
    fontFamily: 'Inter_600SemiBold',
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
  toastBanner: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  infoCard: {
    borderRadius: radius.xl,
    borderWidth: 1.5,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  infoTitle: {
    ...typography.h4,
    fontFamily: 'Inter_700Bold',
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
