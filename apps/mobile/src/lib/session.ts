import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// expo-secure-store has no web implementation (Keychain/Keystore don't exist
// in a browser), so fall back to AsyncStorage there. Native platforms always
// use the Keychain/Keystore-backed SecureStore.
const store =
  Platform.OS === 'web'
    ? {
        setItem: AsyncStorage.setItem,
        getItem: AsyncStorage.getItem,
        deleteItem: AsyncStorage.removeItem,
      }
    : {
        setItem: SecureStore.setItemAsync,
        getItem: SecureStore.getItemAsync,
        deleteItem: SecureStore.deleteItemAsync,
      };

const ACCESS_TOKEN_KEY = 'session:accessToken';
const REFRESH_TOKEN_KEY = 'session:refreshToken';

export interface Session {
  accessToken: string;
  refreshToken: string;
}

export async function saveSession(session: Session): Promise<void> {
  await store.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  await store.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
}

export async function getSession(): Promise<Session | null> {
  const [accessToken, refreshToken] = await Promise.all([
    store.getItem(ACCESS_TOKEN_KEY),
    store.getItem(REFRESH_TOKEN_KEY),
  ]);

  if (!accessToken || !refreshToken) {
    return null;
  }

  return { accessToken, refreshToken };
}

export async function clearSession(): Promise<void> {
  await Promise.all([store.deleteItem(ACCESS_TOKEN_KEY), store.deleteItem(REFRESH_TOKEN_KEY)]);
}
