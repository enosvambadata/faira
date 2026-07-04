import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Sentry from '@sentry/react-native';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import RootNavigator from '@/navigation/RootNavigator';
import { colors } from '@/theme';
import { hasCompletedOnboarding } from '@/lib/onboarding';
import { resolvePostOnboardingRoute } from '@/lib/postOnboardingRoute';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
  tracesSampleRate: 1.0,
});

SplashScreen.preventAutoHideAsync();

type InitialRoute = 'Onboarding' | 'Auth' | 'ProfileSetup' | 'Tabs';

function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [initialRoute, setInitialRoute] = useState<InitialRoute | null>(null);

  useEffect(() => {
    (async () => {
      const onboarded = await hasCompletedOnboarding();
      setInitialRoute(onboarded ? await resolvePostOnboardingRoute() : 'Onboarding');
    })();
  }, []);

  const ready = fontsLoaded && initialRoute !== null;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" backgroundColor={colors.white} />
        <RootNavigator initialRouteName={initialRoute} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(App);
