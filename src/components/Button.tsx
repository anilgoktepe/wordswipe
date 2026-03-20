import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme, radius, spacing, typography } from '../utils/theme';
import { hapticLight } from '../utils/haptics';

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
  /** Pass a vector icon component (e.g. <Ionicons name="play" size={18} color="#fff" />) or a plain string. */
  icon?: React.ReactNode;
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
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    hapticLight();
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  };

  const heights = { sm: 42, md: 52, lg: 56 };
  const fontSizes = { sm: 14, md: 16, lg: 17 };
  const h = heights[size];
  const fs = fontSizes[size];

  if (variant === 'primary') {
    return (
      <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
        <TouchableOpacity
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled || loading}
          activeOpacity={1}
          style={{ borderRadius: radius.full, overflow: 'hidden' }}
        >
          <LinearGradient
            colors={disabled ? ['#A8A4E8', '#C4B5FD'] : ['#6C63FF', '#9B5CF6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.base, { height: h, paddingHorizontal: spacing.lg }]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                {icon && typeof icon !== 'string' && (
                  <View style={styles.iconWrap}>{icon}</View>
                )}
                <Text style={[styles.primaryText, { fontSize: fs }, textStyle]}>
                  {typeof icon === 'string' ? `${icon}  ` : ''}{title}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const variantStyles: Record<string, { bg: string; text: string; border?: string }> = {
    secondary: { bg: theme.primaryLight, text: theme.primary, border: theme.primary + '30' },
    outline: { bg: 'transparent', text: theme.primary, border: theme.primary },
    ghost: { bg: 'transparent', text: theme.textSecondary },
    danger: { bg: theme.incorrectLight, text: theme.incorrect },
  };

  const vs = variantStyles[variant];

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={1}
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
        ]}
      >
        {loading ? (
          <ActivityIndicator color={vs.text} />
        ) : (
          <>
            {icon && typeof icon !== 'string' && (
              <View style={styles.iconWrap}>{icon}</View>
            )}
            <Text style={[styles.baseText, { fontSize: fs, color: vs.text }, textStyle]}>
              {typeof icon === 'string' ? `${icon}  ` : ''}{title}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    marginRight: 8,
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.2,
    fontFamily: 'Inter_700Bold',
  },
  baseText: {
    fontWeight: '600',
    letterSpacing: 0.1,
    fontFamily: 'Inter_600SemiBold',
  },
});
