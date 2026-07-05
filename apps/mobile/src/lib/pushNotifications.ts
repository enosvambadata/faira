import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { profile as profileApi } from './api';

// Tracked so the notification handler can suppress the OS banner while the
// user already has that exact conversation open — otherwise a message that
// arrives live via Realtime (SCRUM-44) would also pop a redundant alert.
let activeConversationId: string | null = null;

export function setActiveConversationId(conversationId: string | null): void {
  activeConversationId = conversationId;
}

export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async notification => {
      const data = notification.request.content.data as { conversationId?: string } | undefined;
      const isForActiveConversation = !!data?.conversationId && data.conversationId === activeConversationId;
      return {
        shouldShowAlert: !isForActiveConversation,
        shouldPlaySound: !isForActiveConversation,
        shouldSetBadge: false,
      };
    },
  });
}

// Registers this device for Expo push notifications and saves the token on
// our own API. No-ops (returns null) on simulators/emulators and web, where
// there is no real push transport to register with.
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

  await profileApi.registerPushToken(token);
  return token;
}
