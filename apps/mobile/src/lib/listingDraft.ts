import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_KEY = 'listing:draft';

export interface ListingDraft {
  title: string;
  description: string;
  price: string;
  condition: string;
  city: string;
  categoryId: string;
  size: string;
  brand: string;
  deliveryOptions: string[];
  weightTier: string;
  photoUris: string[];
}

export async function saveListingDraft(draft: ListingDraft): Promise<void> {
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export async function getListingDraft(): Promise<ListingDraft | null> {
  const value = await AsyncStorage.getItem(DRAFT_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as ListingDraft;
  } catch {
    return null;
  }
}

export async function clearListingDraft(): Promise<void> {
  await AsyncStorage.removeItem(DRAFT_KEY);
}
