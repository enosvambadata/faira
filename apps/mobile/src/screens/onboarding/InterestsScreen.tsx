import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, OnboardingStackParamList } from '@/navigation/types';
import { INTERESTS } from '@/data/interests';
import { colors, textStyles } from '@/theme';
import ProgressIndicator from '@/components/onboarding/ProgressIndicator';
import { useOnboarding } from './OnboardingContext';
import { completeOnboarding } from '@/lib/onboarding';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'Interests'>;

function finishToTabs(navigation: Nav) {
  navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.reset({
    index: 0,
    routes: [{ name: 'Tabs' }],
  });
}

export default function InterestsScreen() {
  const navigation = useNavigation<Nav>();
  const { city, interests, toggleInterest } = useOnboarding();
  const [saving, setSaving] = useState(false);

  const handleFinish = async () => {
    setSaving(true);
    await completeOnboarding(city, interests);
    finishToTabs(navigation);
  };

  return (
    <View style={styles.container}>
      <ProgressIndicator step={3} totalSteps={3} />
      <Text style={styles.title}>What are you interested in?</Text>
      <Text style={styles.subtitle}>Pick a few to personalize your browsing. Optional.</Text>
      <ScrollView contentContainerStyle={styles.grid}>
        {INTERESTS.map(interest => {
          const selected = interests.includes(interest.id);
          return (
            <TouchableOpacity
              key={interest.id}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => toggleInterest(interest.id)}
            >
              <Text style={styles.chipEmoji}>{interest.emoji}</Text>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {interest.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <TouchableOpacity style={styles.button} onPress={handleFinish} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Finish'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 24 },
  title: { ...textStyles.h2, color: colors.text },
  subtitle: { ...textStyles.body, color: colors.muted, marginTop: 4, marginBottom: 16 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  chipEmoji: { fontSize: 16 },
  chipText: { ...textStyles.body, color: colors.text },
  chipTextSelected: { color: colors.primary },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { ...textStyles.bodyMedium, color: colors.white, fontSize: 17 },
});
