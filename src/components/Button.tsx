import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme, radius, spacing, typography } from '../utils/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  theme: Theme;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  theme,
  style,
  textStyle,
  disabled,
  loading,
  icon,
}) => {
  const heights = { sm: 40, md: 52, lg: 60 };
  const fontSizes = { sm: 14, md: 16, lg: 18 };
  const h = heights[size];
  const fs = fontSizes[size];

  if (variant === 'primary') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.85}
        style={[{ borderRadius: radius.full, overflow: 'hidden' }, style]}
      >
        <LinearGradient
          colors={disabled ? ['#B0ADE8', '#B0ADE8'] : ['#6C63FF', '#9B5CF6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.base, { height: h, paddingHorizontal: spacing.lg }]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.primaryText, { fontSize: fs }, textStyle]}>
              {icon ? `${icon}  ` : ''}{title}
            </Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  const variantStyles: Record<string, { bg: string; text: string; border?: string }> = {
    secondary: { bg: theme.primaryLight, text: theme.primary },
    outline: { bg: 'transparent', text: theme.primary, border: theme.primary },
    ghost: { bg: 'transparent', text: theme.textSecondary },
    danger: { bg: theme.incorrectLight, text: theme.incorrect },
  };

  const vs = variantStyles[variant];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.base,
        {
          height: h,
          paddingHorizontal: spacing.lg,
          backgroundColor: vs.bg,
          borderRadius: radius.full,
          borderWidth: vs.border ? 1.5 : 0,
          borderColor: vs.border || 'transparent',
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={vs.text} />
      ) : (
        <Text style={[styles.baseText, { fontSize: fs, color: vs.text }, textStyle]}>
          {icon ? `${icon}  ` : ''}{title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  baseText: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
