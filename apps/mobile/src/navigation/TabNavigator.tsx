import React, { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text, StyleSheet, TouchableOpacity, GestureResponderEvent } from 'react-native';
import * as Notifications from 'expo-notifications';
import { TabParamList, RootStackParamList } from './types';
import { colors } from '@/theme';
import HomeScreen from '@/screens/home/HomeScreen';
import InboxScreen from '@/screens/inbox/InboxScreen';
import SellScreen from '@/screens/sell/SellScreen';
import ProfileScreen from '@/screens/profile/ProfileScreen';
import { UnreadCountProvider, useUnreadCount } from '@/lib/unreadCount';
import { registerForPushNotificationsAsync } from '@/lib/pushNotifications';

function useNotifications() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    registerForPushNotificationsAsync();

    function openConversation(data: unknown) {
      const listingId = (data as { listingId?: string } | undefined)?.listingId;
      if (listingId) navigation.navigate('Chat', { listingId });
    }

    // Cold start: the app was launched by tapping a notification.
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) openConversation(response.notification.request.content.data);
    });

    // Warm: the app was already running (foreground or backgrounded) when tapped.
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      openConversation(response.notification.request.content.data);
    });

    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

const Tab = createBottomTabNavigator<TabParamList>();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: '🏠',
    Inbox: '💬',
    Sell: '+',
    Profile: '👤',
  };
  return (
    <Text style={{ fontSize: label === 'Sell' ? 22 : 20, opacity: focused ? 1 : 0.5 }}>
      {icons[label]}
    </Text>
  );
}

function SellButton({ onPress }: { onPress?: (e: GestureResponderEvent) => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.sellButton} activeOpacity={0.85}>
      <Text style={styles.sellButtonText}>+</Text>
    </TouchableOpacity>
  );
}

function TabsWithBadge() {
  const { unreadCount } = useUnreadCount();
  useNotifications();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Browse',
          tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Inbox"
        component={InboxScreen}
        options={{
          tabBarLabel: 'Inbox',
          tabBarIcon: ({ focused }) => <TabIcon label="Inbox" focused={focused} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
      <Tab.Screen
        name="Sell"
        component={SellScreen}
        options={{
          tabBarLabel: '',
          tabBarButton: props => <SellButton onPress={props.onPress} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon label="Profile" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function TabNavigator() {
  return (
    <UnreadCountProvider>
      <TabsWithBadge />
    </UnreadCountProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.white,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 60,
    paddingBottom: 6,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  sellButton: {
    top: -16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 8,
  },
  sellButtonText: {
    color: colors.white,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '400',
  },
});
