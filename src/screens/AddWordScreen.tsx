import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { Word } from '../data/vocabulary';
import { getTheme, spacing, radius, typography } from '../utils/theme';
import { getLocalWords, normalizeWordKey } from '../services/vocabularyService';
import { translateWord } from '../services/translationService';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';

interface Props {
  navigation: any;
}

const localVocabulary = getLocalWords();

export const AddWordScreen: React.FC<Props> = ({ navigation }) => {
  const { state, dispatch } = useApp();
  const theme = getTheme(state.darkMode);

  const [wordEn, setWordEn] = useState('');
  const [wordTr, setWordTr] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);

  // Tracks which field the user last typed in.
  // Auto-fill is blocked for that field so we never overwrite the user's input.
  const lastTypedField = useRef<'en' | 'tr' | null>(null);

  // Tracks which field currently holds auto-filled (system-generated) content.
  // Cleared when the user manually edits that field.
  // Used to mirror-clear: if the source field is erased, the auto-filled target clears too.
  const autoFilledField = useRef<'en' | 'tr' | null>(null);

  const runTranslation = async (text: string, from: 'en' | 'tr') => {
    const to = from === 'en' ? 'tr' : 'en';
    setIsTranslating(true);
    const result = await translateWord(text, from, to);
    setIsTranslating(false);

    if (!result) return;

    // Only apply if the user hasn't since typed into the target field
    if (from === 'en' && lastTypedField.current !== 'tr') {
      setWordTr(result);
      autoFilledField.current = 'tr';
    }
    if (from === 'tr' && lastTypedField.current !== 'en') {
      setWordEn(result);
      autoFilledField.current = 'en';
    }
  };

  const debouncedTranslate = useDebouncedCallback(runTranslation, 800);

  const handleEnChange = (text: string) => {
    lastTypedField.current = 'en';

    // User cleared EN and TR was auto-filled → mirror-clear TR
    if (!text.trim() && autoFilledField.current === 'tr') {
      setWordTr('');
      autoFilledField.current = null;
    }

    // User is now editing EN manually → EN is no longer auto-filled
    if (autoFilledField.current === 'en') autoFilledField.current = null;

    setWordEn(text);
    debouncedTranslate(text, 'en');
  };

  const handleTrChange = (text: string) => {
    lastTypedField.current = 'tr';

    // User cleared TR and EN was auto-filled → mirror-clear EN
    if (!text.trim() && autoFilledField.current === 'en') {
      setWordEn('');
      autoFilledField.current = null;
    }

    // User is now editing TR manually → TR is no longer auto-filled
    if (autoFilledField.current === 'tr') autoFilledField.current = null;

    setWordTr(text);
    debouncedTranslate(text, 'tr');
  };

  const handleSave = () => {
    const trimmedEn = wordEn.trim();
    const trimmedTr = wordTr.trim();

    if (!trimmedEn) {
      Alert.alert('Eksik alan', 'İngilizce kelimeyi gir.');
      return;
    }
    if (!trimmedTr) {
      Alert.alert('Eksik alan', 'Türkçe anlamı gir.');
      return;
    }

    const normalizedEn = normalizeWordKey(trimmedEn);
    const normalizedTr = normalizeWordKey(trimmedTr);

    const existsInDefault = localVocabulary.some(
      w => normalizeWordKey(w.word) === normalizedEn,
    );
    if (existsInDefault) {
      Alert.alert(
        'Kelime zaten mevcut',
        `"${normalizedEn}" hazır kelime listemizde zaten var. Öğrenme akışında otomatik olarak karşına çıkacak.`,
      );
      return;
    }

    const existsInCustom = state.customWords.some(
      w => normalizeWordKey(w.word) === normalizedEn,
    );
    if (existsInCustom) {
      Alert.alert('Zaten ekli', `"${normalizedEn}" kelimeni zaten eklemişsin.`);
      return;
    }

    const now = Date.now();
    const newWord: Word = {
      id:          now,
      word:        normalizedEn,
      translation: normalizedTr,
      example:     '',
      level:       'medium',
      source:      'custom',
      addedAt:     now,
    };

    dispatch({ type: 'ADD_CUSTOM_WORD', word: newWord });
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Kelime Ekle</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.content}>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            İngilizce ya da Türkçe yaz, karşılığı otomatik çevirsin.
          </Text>

          {/* İngilizce kelime */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.text }]}>İngilizce kelime</Text>
              {isTranslating && lastTypedField.current === 'en' && (
                <ActivityIndicator size="small" color={theme.textTertiary} style={styles.spinner} />
              )}
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
              placeholder="örn. perseverance"
              placeholderTextColor={theme.textTertiary}
              value={wordEn}
              onChangeText={handleEnChange}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              autoFocus
            />
          </View>

          {/* Türkçe anlam */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.text }]}>Türkçe anlam</Text>
              {isTranslating && lastTypedField.current === 'tr' && (
                <ActivityIndicator size="small" color={theme.textTertiary} style={styles.spinner} />
              )}
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
              placeholder="örn. azim, ısrar"
              placeholderTextColor={theme.textTertiary}
              value={wordTr}
              onChangeText={handleTrChange}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
          </View>

          {/* Kaydet butonu */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: theme.primary }]}
            onPress={handleSave}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.saveBtnText}>Kaydet</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { ...typography.h3, fontWeight: '700' },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  hint: { ...typography.body, lineHeight: 22 },
  fieldGroup: { gap: spacing.xs },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: { ...typography.label, fontWeight: '600' },
  spinner: { marginLeft: 4 },
  input: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.sm,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
