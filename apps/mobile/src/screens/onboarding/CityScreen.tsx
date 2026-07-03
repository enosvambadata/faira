import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '@/navigation/types';
import { ZIMBABWE_CITIES } from '@/data/cities';
import { colors, textStyles } from '@/theme';
import ProgressIndicator from '@/components/onboarding/ProgressIndicator';
import { useOnboarding } from './OnboardingContext';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'City'>;

export default function CityScreen() {
  const navigation = useNavigation<Nav>();
  const { city, setCity } = useOnboarding();

  return (
    <View style={styles.container}>
      <ProgressIndicator step={2} totalSteps={3} />
      <Text style={styles.title}>Where are you based?</Text>
      <Text style={styles.subtitle}>We will show you listings and sellers near you first.</Text>
      <FlatList
        data={ZIMBABWE_CITIES}
        keyExtractor={item => item}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const selected = item === city;
          return (
            <TouchableOpacity
              style={[styles.cityRow, selected && styles.cityRowSelected]}
              onPress={() => setCity(item)}
            >
              <Text style={[styles.cityText, selected && styles.cityTextSelected]}>{item}</Text>
              {selected && <Text style={styles.check}>✓</Text>}
            </TouchableOpacity>
          );
        }}
      />
      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Interests')}>
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 24 },
  title: { ...textStyles.h2, color: colors.text },
  subtitle: { ...textStyles.body, color: colors.muted, marginTop: 4, marginBottom: 16 },
  list: { flex: 1 },
  listContent: { gap: 8, paddingBottom: 16 },
  cityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cityRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  cityText: { ...textStyles.body, color: colors.text },
  cityTextSelected: { color: colors.primary },
  check: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { ...textStyles.bodyMedium, color: colors.white, fontSize: 17 },
});
