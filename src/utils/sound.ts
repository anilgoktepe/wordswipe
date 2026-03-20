/**
 * SoundService — cross-platform UI audio.
 *
 * Web:    Web Audio API — synthesized tones, zero files needed.
 * Native: expo-av — preloaded WAV files from assets/sounds/.
 *         Sounds are loaded once at startup via SoundService.init().
 *         No-overlap: each sound stops + rewinds before replaying.
 *         playsInSilentModeIOS: true so sounds work without unmuting.
 */
import { Platform } from 'react-native';

// ─── Web Audio synthesis (web only) ──────────────────────────────────────────

type Note = [freq: number, startSec: number, durationSec: number];

function tone(notes: Note[], volume = 0.15, wave: OscillatorType = 'sine') {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx: AudioContext = new Ctx();
    notes.forEach(([freq, start, dur]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(volume, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + start + dur,
      );
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.01);
    });
    const end = Math.max(...notes.map(([, s, d]) => s + d));
    setTimeout(() => { try { ctx.close(); } catch (_) {} }, (end + 0.2) * 1000);
  } catch (_) {}
}

// ─── Native audio via expo-av ─────────────────────────────────────────────────

type SoundKey = 'correct' | 'wrong' | 'complete' | 'flip';

const soundFiles: Record<SoundKey, any> = {
  correct:  require('../../assets/sounds/correct.wav'),
  wrong:    require('../../assets/sounds/wrong.wav'),
  complete: require('../../assets/sounds/complete.wav'),
  // flip uses the same correct file at lower volume for a subtle click
  flip:     require('../../assets/sounds/correct.wav'),
};

const cache: Partial<Record<SoundKey, Audio.Sound>> = {};
let audioReady = false;

/**
 * Call once at app startup (e.g. in App.tsx after fonts load).
 * Configures the audio session and preloads all sounds.
 */
async function init(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    // Preload all sounds in parallel
    await Promise.all(
      (Object.keys(soundFiles) as SoundKey[]).map(async (key) => {
        try {
          const { sound } = await Audio.Sound.createAsync(soundFiles[key], {
            shouldPlay: false,
            volume: key === 'flip' ? 0.25 : 0.5,
          });
          cache[key] = sound;
        } catch (_) {}
      }),
    );

    audioReady = true;
  } catch (_) {}
}

/**
 * Play a preloaded native sound.
 * Rewinds and replays if it's still playing (no overlap).
 */
async function playNative(key: SoundKey): Promise<void> {
  if (!audioReady) return;
  const sound = cache[key];
  if (!sound) return;
  try {
    // Stop + rewind so rapid triggers don't stack
    await sound.stopAsync();
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch (_) {}
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const SoundService = {
  /** Call once at app startup to preload native sounds. No-op on web. */
  init,

  /** Pleasant C5→E5 chime — correct answer */
  playCorrect() {
    if (Platform.OS === 'web') {
      tone([[523, 0, 0.11], [659, 0.10, 0.18]], 0.18);
    } else {
      playNative('correct');
    }
  },

  /** Low descending thud — wrong answer */
  playWrong() {
    if (Platform.OS === 'web') {
      tone([[280, 0, 0.08], [210, 0.07, 0.13]], 0.14);
    } else {
      playNative('wrong');
    }
  },

  /** Triumphant C5→E5→G5 arpeggio — lesson / quiz complete */
  playComplete() {
    if (Platform.OS === 'web') {
      tone([[523, 0, 0.12], [659, 0.11, 0.12], [784, 0.22, 0.28]], 0.20);
    } else {
      playNative('complete');
    }
  },

  /** Soft high click — card flip */
  playFlip() {
    if (Platform.OS === 'web') {
      tone([[900, 0, 0.04]], 0.07);
    } else {
      playNative('flip');
    }
  },
};

