/**
 * ConfettiEffect
 * Pure React Native Animated — no third-party deps.
 * Particles burst from the center of the screen, arc upward then fall,
 * spin freely, and fade out. Entire animation runs on the native thread.
 */
import React, { useRef, useEffect } from 'react';
import { View, Animated, StyleSheet, Dimensions, Easing } from 'react-native';

const { width, height } = Dimensions.get('window');

const PARTICLE_COUNT = 36;
const COLORS = [
  '#6C63FF', '#9B5CF6', '#F59E0B', '#FBBF24',
  '#10B981', '#34D399', '#EF4444', '#FB7185',
  '#3B82F6', '#60A5FA', '#EC4899', '#F472B6',
  '#FFD700', '#FFF176',
];

interface Particle {
  x:       Animated.Value;
  y:       Animated.Value;
  rotate:  Animated.Value;
  opacity: Animated.Value;
  scale:   Animated.Value;
  color:   string;
  size:    number;
  isRect:  boolean;
}

function makeParticle(): Particle {
  return {
    x:       new Animated.Value(0),
    y:       new Animated.Value(0),
    rotate:  new Animated.Value(0),
    opacity: new Animated.Value(0),
    scale:   new Animated.Value(0),
    color:   COLORS[Math.floor(Math.random() * COLORS.length)],
    size:    7 + Math.random() * 9,
    isRect:  Math.random() > 0.45,
  };
}

interface Props {
  /** Set to true to fire the confetti burst. */
  visible: boolean;
}

export const ConfettiEffect: React.FC<Props> = ({ visible }) => {
  const particles = useRef<Particle[]>(
    Array.from({ length: PARTICLE_COUNT }, makeParticle),
  ).current;

  useEffect(() => {
    if (!visible) return;

    const anims = particles.map((p) => {
      // Reset to origin before animating
      p.x.setValue(0);
      p.y.setValue(0);
      p.rotate.setValue(0);
      p.opacity.setValue(0);
      p.scale.setValue(0);

      const angle      = Math.random() * Math.PI * 2;
      const spread     = 90 + Math.random() * 130;
      const targetX    = Math.cos(angle) * spread;
      const upBurst    = -(50 + Math.random() * 130); // initial upward pop
      const fallTarget = 180 + Math.random() * (height * 0.50); // final resting y
      const duration   = 1400 + Math.random() * 500;
      const delay      = Math.random() * 220;

      return Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          // Pop in
          Animated.spring(p.scale, {
            toValue: 1,
            useNativeDriver: true,
            tension: 140,
            friction: 5,
          }),
          Animated.timing(p.opacity, {
            toValue: 1,
            duration: 80,
            useNativeDriver: true,
          }),
          // Horizontal spread
          Animated.timing(p.x, {
            toValue: targetX,
            duration,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }),
          // Arc: upward burst then fall with gravity
          Animated.sequence([
            Animated.timing(p.y, {
              toValue: upBurst,
              duration: 320,
              useNativeDriver: true,
              easing: Easing.out(Easing.cubic),
            }),
            Animated.timing(p.y, {
              toValue: fallTarget,
              duration: duration - 300,
              useNativeDriver: true,
              easing: Easing.in(Easing.quad),
            }),
          ]),
          // Full free-spin
          Animated.timing(p.rotate, {
            toValue: (Math.random() > 0.5 ? 1 : -1) * (4 + Math.random() * 6),
            duration,
            useNativeDriver: true,
            easing: Easing.linear,
          }),
          // Fade out in the last 40% of flight
          Animated.sequence([
            Animated.delay(duration * 0.6),
            Animated.timing(p.opacity, {
              toValue: 0,
              duration: duration * 0.4 + 100,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]);
    });

    Animated.parallel(anims).start();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            // Burst origin: centre-top of the viewport (where success circle sits)
            left: width / 2 - p.size / 2,
            top:  height * 0.30,
            width:  p.size,
            height: p.isRect ? p.size * 0.55 : p.size,
            borderRadius: p.isRect ? 2 : p.size / 2,
            backgroundColor: p.color,
            opacity: p.opacity,
            transform: [
              { translateX: p.x },
              { translateY: p.y },
              {
                rotate: p.rotate.interpolate({
                  inputRange: [-10, 10],
                  outputRange: ['-1080deg', '1080deg'],
                }),
              },
              { scale: p.scale },
            ],
          }}
        />
      ))}
    </View>
  );
};
