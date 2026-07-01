import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography } from '@/theme';

export default function SellScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Sell an Item</Text>
      <Text style={styles.sub}>Create listing form — coming in SCRUM-31</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontSize: typography.fontSizes.xl, fontWeight: typography.fontWeights.bold, color: colors.text },
  sub: { fontSize: typography.fontSizes.md, color: colors.muted },
});
