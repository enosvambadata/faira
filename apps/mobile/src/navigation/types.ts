import { NavigatorScreenParams } from '@react-navigation/native';

// Bottom tab param list
export type TabParamList = {
  Home: undefined;
  Inbox: undefined;
  Sell: undefined;
  Profile: undefined;
};

// 3-step onboarding flow, shown once before a new user reaches the tabs
export type OnboardingStackParamList = {
  Welcome: undefined;
  City: undefined;
  Interests: undefined;
};

// Root stack — sits above the tabs for modal/push screens
export type RootStackParamList = {
  Onboarding: NavigatorScreenParams<OnboardingStackParamList>;
  Tabs: NavigatorScreenParams<TabParamList>;
  ListingDetail: { listingId: string };
  Chat: { conversationId: string };
  SellerProfile: { sellerId: string };
};

// Declare types globally for useNavigation without generics
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
