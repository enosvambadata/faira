import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography } from '@/theme';

export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Profile</Text>
      <Text style={styles.sub}>Account settings — coming in SCRUM-49</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontSize: typography.fontSizes.xl, fontWeight: typography.fontWeights.bold, color: colors.text },
  sub: { fontSize: typography.fontSizes.md, color: colors.muted },
});
