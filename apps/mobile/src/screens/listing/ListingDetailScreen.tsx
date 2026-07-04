import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { listings as listingsApi, ListingDetail, ApiError } from '@/lib/api';
import { isWishlisted, toggleWishlist } from '@/lib/wishlist';

type Props = NativeStackScreenProps<RootStackParamList, 'ListingDetail'>;

const CONDITION_LABELS: Record<string, string> = {
  NEW: 'New',
  LIKE_NEW: 'Like New',
  GOOD: 'Good',
  FAIR: 'Fair',
};

const screenWidth = Dimensions.get('window').width;

export default function ListingDetailScreen({ route, navigation }: Props) {
  const { listingId } = route.params;

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [data, wishlisted] = await Promise.all([listingsApi.get(listingId), isWishlisted(listingId)]);
        setListing(data);
        setSaved(wishlisted);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load this listing');
      } finally {
        setLoading(false);
      }
    })();
  }, [listingId]);

  const handleToggleSave = async () => {
    const nowSaved = await toggleWishlist(listingId);
    setSaved(nowSaved);
  };

  const handleMessageSeller = () => {
    navigation.navigate('Chat', { conversationId: `listing-${listingId}` });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !listing) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error ?? 'Listing not found'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={e => setActivePhoto(Math.round(e.nativeEvent.contentOffset.x / screenWidth))}
          scrollEventThrottle={16}
        >
          {(listing.imageUrls.length > 0 ? listing.imageUrls : [null]).map((uri, index) => (
            <View key={uri ?? index} style={[styles.photoSlide, { width: screenWidth }]}>
              {uri ? (
                <Image source={{ uri }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoPlaceholder]} />
              )}
            </View>
          ))}
        </ScrollView>
        {listing.imageUrls.length > 1 && (
          <View style={styles.dots}>
            {listing.imageUrls.map((uri, index) => (
              <View key={uri} style={[styles.dot, index === activePhoto && styles.dotActive]} />
            ))}
          </View>
        )}
        <TouchableOpacity testID="wishlist-heart" style={styles.heart} onPress={handleToggleSave}>
          <Text style={styles.heartText}>{saved ? '♥' : '♡'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text style={styles.price}>${listing.price}</Text>
        <Text style={styles.title}>{listing.title}</Text>

        <View style={styles.tags}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{CONDITION_LABELS[listing.condition] ?? listing.condition}</Text>
          </View>
          {listing.attributes.brand && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{listing.attributes.brand}</Text>
            </View>
          )}
          {listing.attributes.size && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>Size {listing.attributes.size}</Text>
            </View>
          )}
        </View>

        <Text style={styles.city}>{listing.city}</Text>

        {listing.description && <Text style={styles.description}>{listing.description}</Text>}

        <View style={styles.sellerRow}>
          {listing.seller.avatarUrl ? (
            <Image source={{ uri: listing.seller.avatarUrl }} style={styles.sellerAvatar} />
          ) : (
            <View style={[styles.sellerAvatar, styles.sellerAvatarPlaceholder]}>
              <Text style={styles.sellerAvatarText}>{(listing.seller.displayName ?? '?')[0]}</Text>
            </View>
          )}
          <View>
            <Text style={styles.sellerName}>{listing.seller.displayName ?? 'Faira seller'}</Text>
            {listing.seller.city && <Text style={styles.sellerCity}>{listing.seller.city}</Text>}
          </View>
        </View>

        <TouchableOpacity style={styles.messageButton} onPress={handleMessageSeller}>
          <Text style={styles.messageButtonText}>Message Seller</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  error: { ...textStyles.body, color: colors.red },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 40 },
  photoSlide: { aspectRatio: 1 },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { backgroundColor: colors.border },
  dots: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.6)' },
  dotActive: { backgroundColor: colors.white },
  heart: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartText: { color: colors.primary, fontSize: 20 },
  body: { padding: 20 },
  price: { ...textStyles.h1, color: colors.primary },
  title: { ...textStyles.h3, color: colors.text, marginTop: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tag: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
  },
  tagText: { ...textStyles.caption, color: colors.primary },
  city: { ...textStyles.body, color: colors.muted, marginTop: 12 },
  description: { ...textStyles.body, color: colors.text, marginTop: 12 },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24 },
  sellerAvatar: { width: 44, height: 44, borderRadius: 22 },
  sellerAvatarPlaceholder: {
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerAvatarText: { ...textStyles.bodyMedium, color: colors.primary },
  sellerName: { ...textStyles.bodyMedium, color: colors.text },
  sellerCity: { ...textStyles.caption, color: colors.muted },
  messageButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  messageButtonText: { ...textStyles.bodyMedium, color: colors.white, fontSize: 17 },
});
