import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import RootNavigator from '@/navigation/RootNavigator';
import { colors } from '@/theme';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
  tracesSampleRate: 1.0,
});

function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" backgroundColor={colors.white} />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(App);
