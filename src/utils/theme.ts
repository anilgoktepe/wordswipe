export const lightTheme = {
  background: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceSecondary: '#EEF1F6',
  primary: '#6C63FF',
  primaryLight: '#E8E6FF',
  secondary: '#FF6584',
  accent: '#43D99D',
  text: '#1A1A2E',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  border: '#E5E7EB',
  correct: '#10B981',
  correctLight: '#D1FAE5',
  incorrect: '#EF4444',
  incorrectLight: '#FEE2E2',
  warning: '#F59E0B',
  card: '#FFFFFF',
  cardShadow: 'rgba(108, 99, 255, 0.08)',
  streak: '#FF6B35',
  xp: '#F59E0B',
  overlay: 'rgba(0,0,0,0.4)',
};

export const darkTheme = {
  background: '#0F0F1A',
  surface: '#1C1C2E',
  surfaceSecondary: '#252537',
  primary: '#7C74FF',
  primaryLight: '#2A2850',
  secondary: '#FF6584',
  accent: '#43D99D',
  text: '#F0F0F8',
  textSecondary: '#9CA3AF',
  textTertiary: '#6B7280',
  border: '#2E2E45',
  correct: '#10B981',
  correctLight: '#064E3B',
  incorrect: '#EF4444',
  incorrectLight: '#7F1D1D',
  warning: '#F59E0B',
  card: '#1C1C2E',
  cardShadow: 'rgba(0,0,0,0.3)',
  streak: '#FF6B35',
  xp: '#F59E0B',
  overlay: 'rgba(0,0,0,0.6)',
};

export type Theme = typeof lightTheme;

export const getTheme = (darkMode: boolean): Theme =>
  darkMode ? darkTheme : lightTheme;

export const typography = {
  h1: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.5 },
  h2: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.3 },
  h3: { fontSize: 20, fontWeight: '700' as const },
  h4: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyBold: { fontSize: 16, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  small: { fontSize: 11, fontWeight: '500' as const },
  word: { fontSize: 36, fontWeight: '800' as const, letterSpacing: -0.5 },
  meaning: { fontSize: 22, fontWeight: '600' as const },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  full: 999,
};

export const shadows = {
  sm: {
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 5,
  },
  lg: {
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
};
