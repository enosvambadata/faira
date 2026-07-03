import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, textStyles } from '@/theme';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Faira</Text>
      <Text style={styles.subtitle}>Browse listings — coming in SCRUM-35</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    ...textStyles.h1,
    color: colors.primary,
  },
  subtitle: {
    ...textStyles.body,
    color: colors.muted,
  },
});
