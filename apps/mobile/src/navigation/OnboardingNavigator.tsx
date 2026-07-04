import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList, RootStackParamList } from './types';
import { OnboardingProvider } from '@/screens/onboarding/OnboardingContext';
import WelcomeScreen from '@/screens/onboarding/WelcomeScreen';
import CityScreen from '@/screens/onboarding/CityScreen';
import InterestsScreen from '@/screens/onboarding/InterestsScreen';
import { skipOnboarding } from '@/lib/onboarding';
import { resolvePostOnboardingRoute } from '@/lib/postOnboardingRoute';
import { colors, textStyles } from '@/theme';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

function SkipButton() {
  const navigation = useNavigation();

  const handleSkip = async () => {
    await skipOnboarding();
    const route = await resolvePostOnboardingRoute();
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.reset({
      index: 0,
      routes: [{ name: route }],
    });
  };

  return (
    <TouchableOpacity onPress={handleSkip} hitSlop={12}>
      <Text style={{ ...textStyles.bodyMedium, color: colors.muted }}>Skip</Text>
    </TouchableOpacity>
  );
}

export default function OnboardingNavigator() {
  return (
    <OnboardingProvider>
      <Stack.Navigator
        screenOptions={{
          headerShown: true,
          headerTitle: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.bg },
          headerBackVisible: false,
          headerRight: () => <SkipButton />,
        }}
      >
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="City" component={CityScreen} />
        <Stack.Screen name="Interests" component={InterestsScreen} />
      </Stack.Navigator>
    </OnboardingProvider>
  );
}
