import { NavigatorScreenParams } from '@react-navigation/native';
import { ListingFilters } from '@/lib/api';

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

// Signup / login / phone OTP verification
export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  OtpVerify: { phone: string };
};

// Root stack — sits above the tabs for modal/push screens
export type RootStackParamList = {
  Onboarding: NavigatorScreenParams<OnboardingStackParamList>;
  Auth: NavigatorScreenParams<AuthStackParamList>;
  ProfileSetup: undefined;
  Tabs: NavigatorScreenParams<TabParamList>;
  ListingDetail: { listingId: string };
  EditListing: { listingId: string };
  Filters: { current: ListingFilters; onApply: (filters: ListingFilters) => void };
  SavedItems: undefined;
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
