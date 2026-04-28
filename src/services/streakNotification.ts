/**
 * streakNotification.ts
 *
 * Retention bildirimleri — üç ayrı kanal:
 *
 *   ws_streak_reminder      — 20:00  Kullanıcı bugün çalışmadıysa streak uyarısı
 *   ws_add_word_reminder    — 14:00  "Bugün öğrendiğin kelimeleri ekle, pratik yap"
 *   ws_sentence_reminder    — 11:00  Öğrenilen kelime varsa Cümle Kur hatırlatıcı
 *
 * AppNavigator'da her uygulama açılışında çağrılır.
 * Sabit identifier'lar sayesinde her kanaldan en fazla 1 bildirim kuyrukta olur.
 */

import { Platform } from 'react-native';
import { AppState } from '../context/AppContext';

export const STREAK_NOTIF_ID   = 'ws_streak_reminder';
export const ADD_WORD_NOTIF_ID = 'ws_add_word_reminder';
export const SENTENCE_NOTIF_ID = 'ws_sentence_reminder';

// Streak uzunluğuna göre mesaj seçimi
function buildStreakContent(streak: number): { title: string; body: string } {
  if (streak >= 14) {
    return {
      title: `🔥 ${streak} günlük serin tehlikede!`,
      body: 'Bugün çalışmazsan uzun seriniz sıfırlanır. Hemen başla!',
    };
  }
  if (streak >= 7) {
    return {
      title: `⚡ ${streak} günlük muhteşem serin var!`,
      body: 'Bugün de devam et, alışkanlık oluşturmak 21 gün sürer.',
    };
  }
  if (streak >= 3) {
    return {
      title: `🎯 ${streak} günlük serini koruyabilir misin?`,
      body: 'Sadece 5 dakika yeterli. Hadi bir ders daha!',
    };
  }
  if (streak === 1) {
    return {
      title: '📚 Dün başladın, bugün devam et!',
      body: 'Serinizi oluşturmak için bugün de çalışman gerekiyor.',
    };
  }
  return {
    title: '🌟 Bugün bir şeyler öğren!',
    body: 'Her gün birkaç kelime, büyük fark yaratır.',
  };
}

function studiedToday(lastStudyDate: string | null): boolean {
  if (!lastStudyDate) return false;
  return lastStudyDate === new Date().toDateString();
}

export async function scheduleStreakReminder(state: AppState): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const Notif = await import('expo-notifications');

    const { status } = await Notif.getPermissionsAsync();
    if (status !== 'granted') return;

    // Kullanıcı bugün çalıştıysa uyarıya gerek yok — iptal et
    if (studiedToday(state.lastStudyDate)) {
      await Notif.cancelScheduledNotificationAsync(STREAK_NOTIF_ID).catch(() => {});
      return;
    }

    // Hedef saat: 20:00, geçtiyse 21:00
    const now = new Date();
    const target = new Date();
    target.setHours(20, 0, 0, 0);

    if (now >= target) {
      target.setHours(21, 0, 0, 0);
    }

    // 21:00 de geçtiyse bugün için bildirim göndermeye gerek yok
    if (now >= target) return;

    const secondsUntil = Math.max(
      Math.floor((target.getTime() - Date.now()) / 1000),
      60,
    );

    // Önceki bildirimi iptal edip yeni planla (her açılışta güncelle)
    await Notif.cancelScheduledNotificationAsync(STREAK_NOTIF_ID).catch(() => {});

    const content = buildStreakContent(state.streak);

    await Notif.scheduleNotificationAsync({
      identifier: STREAK_NOTIF_ID,
      content: {
        title: content.title,
        body:  content.body,
        sound: true,
        data:  { type: 'streak_reminder' },
      },
      trigger: {
        type:    Notif.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntil,
        repeats: false,
      },
    });
  } catch (_) {
    // İzin verilmemişse veya simülatör kısıtlamalarında sessizce devam et
  }
}

// ─── Yardımcı: hedef saate kaç saniye kaldığını döndür ──────────────────────
// Saat geçtiyse null döner (bugün için bildirim planlanmaz).

function secondsUntilHour(hour: number, minute = 0): number | null {
  const now    = new Date();
  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  if (now >= target) return null;
  return Math.max(Math.floor((target.getTime() - now.getTime()) / 1000), 60);
}

// ─── Kelime Ekle hatırlatıcısı (14:00) ───────────────────────────────────────

const ADD_WORD_TEMPLATES = [
  {
    title: '📝 Bugün yeni kelimeler öğrendin mi?',
    body: 'Öğrendiğin kelimeleri uygulamaya ekle ve pratik yapmaya başla!',
  },
  {
    title: '✏️ Kelime defterini güncelle!',
    body: 'Gün içinde karşılaştığın yeni İngilizce kelimeleri ekleyip test edebilirsin.',
  },
  {
    title: '🆕 Yeni kelime ekle, hemen öğren!',
    body: 'Bugün bir kelime ekle — yarın sana quiz olarak gelsin.',
  },
];

export async function scheduleAddWordReminder(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const Notif = await import('expo-notifications');

    const { status } = await Notif.getPermissionsAsync();
    if (status !== 'granted') return;

    const secs = secondsUntilHour(14);
    if (secs === null) return; // 14:00 geçti, bugün planlanmaz

    await Notif.cancelScheduledNotificationAsync(ADD_WORD_NOTIF_ID).catch(() => {});

    const content = ADD_WORD_TEMPLATES[Math.floor(Math.random() * ADD_WORD_TEMPLATES.length)];

    await Notif.scheduleNotificationAsync({
      identifier: ADD_WORD_NOTIF_ID,
      content: {
        title: content.title,
        body:  content.body,
        sound: true,
        data:  { type: 'add_word_reminder' },
      },
      trigger: {
        type:    Notif.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secs,
        repeats: false,
      },
    });
  } catch (_) {}
}

// ─── Cümle Kur hatırlatıcısı (11:00) ─────────────────────────────────────────
// Yalnızca kullanıcının en az 3 öğrenilmiş kelimesi varsa planlanır.

const SENTENCE_TEMPLATES = [
  {
    title: '✍️ Cümle kurma zamanı!',
    body: 'Öğrendiğin kelimelerle cümle kur, İngilizce\'ni bir adım ileri taşı.',
  },
  {
    title: '💬 Bugün bir cümle yaz!',
    body: 'Kelimelerini cümlede kullanmak öğrenmeyi %70 hızlandırır.',
  },
  {
    title: '🧠 Bilgiyi pratiğe dök!',
    body: 'Öğrendiğin kelimelerle kısa bir cümle yaz — AI seni değerlendirsin.',
  },
];

const SENTENCE_MIN_LEARNED = 3;

export async function scheduleSentenceBuilderReminder(state: AppState): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const Notif = await import('expo-notifications');

    const { status } = await Notif.getPermissionsAsync();
    if (status !== 'granted') return;

    // Yeterli öğrenilmiş kelime yoksa bildirimi iptal et
    const learnedCount = state.learnedWordIds?.length ?? 0;
    if (learnedCount < SENTENCE_MIN_LEARNED) {
      await Notif.cancelScheduledNotificationAsync(SENTENCE_NOTIF_ID).catch(() => {});
      return;
    }

    const secs = secondsUntilHour(11);
    if (secs === null) return; // 11:00 geçti

    await Notif.cancelScheduledNotificationAsync(SENTENCE_NOTIF_ID).catch(() => {});

    const content = SENTENCE_TEMPLATES[Math.floor(Math.random() * SENTENCE_TEMPLATES.length)];

    await Notif.scheduleNotificationAsync({
      identifier: SENTENCE_NOTIF_ID,
      content: {
        title: content.title,
        body:  content.body,
        sound: true,
        data:  { type: 'sentence_builder_reminder' },
      },
      trigger: {
        type:    Notif.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secs,
        repeats: false,
      },
    });
  } catch (_) {}
}
