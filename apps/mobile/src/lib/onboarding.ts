import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CITY } from '@/data/cities';
import { DEFAULT_INTERESTS } from '@/data/interests';

const COMPLETED_KEY = 'onboarding:completed';
const CITY_KEY = 'onboarding:city';
const INTERESTS_KEY = 'onboarding:interests';

export async function hasCompletedOnboarding(): Promise<boolean> {
  const value = await AsyncStorage.getItem(COMPLETED_KEY);
  return value === 'true';
}

export async function completeOnboarding(city: string, interests: string[]): Promise<void> {
  await AsyncStorage.multiSet([
    [COMPLETED_KEY, 'true'],
    [CITY_KEY, city],
    [INTERESTS_KEY, JSON.stringify(interests)],
  ]);
}

export async function skipOnboarding(): Promise<void> {
  await completeOnboarding(DEFAULT_CITY, DEFAULT_INTERESTS);
}

export async function getOnboardingCity(): Promise<string> {
  const value = await AsyncStorage.getItem(CITY_KEY);
  return value ?? DEFAULT_CITY;
}
