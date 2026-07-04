import AsyncStorage from '@react-native-async-storage/async-storage';

const WISHLIST_KEY = 'wishlist:listingIds';

// Local-only for now (device, not account) — no wishlist table/endpoint
// exists yet. Migrate to a real per-account table if/when this needs to
// sync across devices.
async function getIds(): Promise<string[]> {
  const value = await AsyncStorage.getItem(WISHLIST_KEY);
  if (!value) return [];
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

export async function isWishlisted(listingId: string): Promise<boolean> {
  const ids = await getIds();
  return ids.includes(listingId);
}

export async function toggleWishlist(listingId: string): Promise<boolean> {
  const ids = await getIds();
  const next = ids.includes(listingId) ? ids.filter(id => id !== listingId) : [...ids, listingId];
  await AsyncStorage.setItem(WISHLIST_KEY, JSON.stringify(next));
  return next.includes(listingId);
}
