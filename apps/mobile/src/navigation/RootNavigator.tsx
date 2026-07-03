import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import TabNavigator from './TabNavigator';
import OnboardingNavigator from './OnboardingNavigator';
import ListingDetailScreen from '@/screens/listing/ListingDetailScreen';
import { colors } from '@/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

interface Props {
  initialRouteName: 'Onboarding' | 'Tabs';
}

export default function RootNavigator({ initialRouteName }: Props) {
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerStyle: { backgroundColor: colors.white },
        headerTintColor: colors.primary,
        headerTitleStyle: { fontWeight: '600', color: colors.text },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="Onboarding"
        component={OnboardingNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="ListingDetail"
        component={ListingDetailScreen}
        options={{ title: 'Item Detail' }}
      />
    </Stack.Navigator>
  );
}
