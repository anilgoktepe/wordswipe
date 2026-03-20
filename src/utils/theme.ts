export const lightTheme = {
  background: '#F4F4F8',
  surface: '#FFFFFF',
  surfaceSecondary: '#EEEEF5',
  primary: '#6C63FF',
  primaryMid: '#8B85FF',
  primaryLight: '#ECEAFF',
  cardBorder: '#E8E7F5',
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
  cardShadow: 'rgba(108, 99, 255, 0.10)',
  streak: '#FF6B35',
  xp: '#F59E0B',
  overlay: 'rgba(0,0,0,0.4)',
};

export const darkTheme = {
  background: '#0D0D1B',
  surface: '#18182C',
  surfaceSecondary: '#23233A',
  primary: '#7C74FF',
  primaryMid: '#9590FF',
  primaryLight: '#252250',
  cardBorder: '#2A2860',
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
  card: '#18182C',
  cardShadow: 'rgba(0,0,0,0.35)',
  streak: '#FF6B35',
  xp: '#F59E0B',
  overlay: 'rgba(0,0,0,0.6)',
};

export type Theme = typeof lightTheme;

export const getTheme = (darkMode: boolean): Theme =>
  darkMode ? darkTheme : lightTheme;

export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
    fontFamily: 'Inter_800ExtraBold',
  },
  h2: {
    fontSize: 26,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
    fontFamily: 'Inter_700Bold',
  },
  h3: {
    fontSize: 20,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  h4: {
    fontSize: 18,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    fontFamily: 'Inter_400Regular',
  },
  bodyBold: {
    fontSize: 16,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  caption: {
    fontSize: 13,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
  },
  small: {
    fontSize: 11,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
  },
  label: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
    fontFamily: 'Inter_700Bold',
  },
  word: {
    fontSize: 36,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
    fontFamily: 'Inter_800ExtraBold',
  },
  meaning: {
    fontSize: 22,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
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
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.13,
    shadowRadius: 16,
    elevation: 5,
  },
  lg: {
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },
};
