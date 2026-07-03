import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '@/theme';

interface Props {
  step: number;
  totalSteps: number;
}

export default function ProgressIndicator({ step, totalSteps }: Props) {
  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: totalSteps, now: step }}>
      {Array.from({ length: totalSteps }, (_, index) => (
        <View
          key={index}
          style={[styles.dot, index < step ? styles.dotActive : styles.dotInactive]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  dot: {
    height: 6,
    width: 24,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  dotInactive: {
    backgroundColor: colors.border,
  },
});
