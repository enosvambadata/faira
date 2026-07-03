import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'Welcome'>;

export default function WelcomeScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🛍️</Text>
        <Text style={styles.title}>Welcome to Faira Market</Text>
        <Text style={styles.subtitle}>
          Buy and sell secondhand and new goods across Zimbabwe — from fashion to electronics and
          everything in between.
        </Text>
      </View>
      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('City')}>
        <Text style={styles.buttonText}>Get Started</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'space-between',
    padding: 24,
    paddingBottom: 40,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  emoji: {
    fontSize: 56,
  },
  title: {
    ...textStyles.h1,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    ...textStyles.body,
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    ...textStyles.bodyMedium,
    color: colors.white,
    fontSize: 17,
  },
});
