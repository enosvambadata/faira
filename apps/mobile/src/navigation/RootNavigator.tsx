import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import TabNavigator from './TabNavigator';
import OnboardingNavigator from './OnboardingNavigator';
import AuthNavigator from './AuthNavigator';
import ProfileSetupScreen from '@/screens/profile/ProfileSetupScreen';
import ListingDetailScreen from '@/screens/listing/ListingDetailScreen';
import EditListingScreen from '@/screens/listing/EditListingScreen';
import FilterScreen from '@/screens/home/FilterScreen';
import SavedItemsScreen from '@/screens/wishlist/SavedItemsScreen';
import ChatScreen from '@/screens/chat/ChatScreen';
import SellerProfileScreen from '@/screens/seller/SellerProfileScreen';
import { colors } from '@/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

interface Props {
  initialRouteName: 'Onboarding' | 'Auth' | 'ProfileSetup' | 'Tabs';
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
      <Stack.Screen name="Auth" component={AuthNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="ProfileSetup"
        component={ProfileSetupScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="ListingDetail"
        component={ListingDetailScreen}
        options={{ title: 'Item Detail' }}
      />
      <Stack.Screen
        name="EditListing"
        component={EditListingScreen}
        options={{ title: 'Edit Listing' }}
      />
      <Stack.Screen
        name="Filters"
        component={FilterScreen}
        options={{ title: 'Filters', presentation: 'modal' }}
      />
      <Stack.Screen
        name="SavedItems"
        component={SavedItemsScreen}
        options={{ title: 'Saved Items' }}
      />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat' }} />
      <Stack.Screen
        name="SellerProfile"
        component={SellerProfileScreen}
        options={{ title: 'Seller' }}
      />
    </Stack.Navigator>
  );
}
