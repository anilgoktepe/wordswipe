/**
 * XPPopup — imperative floating "+N XP" reward badge.
 * Call xpPopupRef.current?.show(amount) to trigger.
 * Slides up and fades out automatically. Runs on native thread.
 */
import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Animated, Text, StyleSheet, View } from 'react-native';

export interface XPPopupHandle {
  show: (amount: number) => void;
}

export const XPPopup = forwardRef<XPPopupHandle>((_, ref) => {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale      = useRef(new Animated.Value(0.5)).current;
  const [amount, setAmount] = useState(1);
  const running = useRef(false);

  useImperativeHandle(ref, () => ({
    show(xp: number) {
      setAmount(xp);

      // Stop any in-flight animation cleanly
      opacity.stopAnimation();
      translateY.stopAnimation();
      scale.stopAnimation();
      opacity.setValue(0);
      translateY.setValue(0);
      scale.setValue(0.5);
      running.current = true;

      Animated.parallel([
        // Pop in, hold, fade out
        Animated.sequence([
          Animated.parallel([
            Animated.spring(scale, {
              toValue: 1,
              useNativeDriver: true,
              tension: 120,
              friction: 6,
            }),
            Animated.timing(opacity, {
              toValue: 1,
              duration: 120,
              useNativeDriver: true,
            }),
          ]),
          Animated.delay(520),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 380,
            useNativeDriver: true,
          }),
        ]),
        // Float upward
        Animated.timing(translateY, {
          toValue: -72,
          duration: 1020,
          useNativeDriver: true,
        }),
      ]).start(() => { running.current = false; });
    },
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        { opacity, transform: [{ translateY }, { scale }] },
      ]}
    >
      <View style={styles.pill}>
        <Text style={styles.text}>+{amount} XP</Text>
        <Text style={styles.star}>⭐</Text>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    zIndex: 9999,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#6C63FF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 28,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
  text: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: 0.3,
  },
  star: {
    fontSize: 18,
  },
});
