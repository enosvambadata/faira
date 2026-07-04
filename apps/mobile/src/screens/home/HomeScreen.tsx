import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { listings as listingsApi, ListingSummary } from '@/lib/api';
import { toggleWishlist } from '@/lib/wishlist';

export default function HomeScreen() {
  const navigation = useNavigation();

  const [items, setItems] = useState<ListingSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [wishlisted, setWishlisted] = useState<Set<string>>(new Set());

  const loadPage = useCallback(async (pageToLoad: number) => {
    const result = await listingsApi.browse(pageToLoad);
    setItems(current => (pageToLoad === 1 ? result.data : [...current, ...result.data]));
    setHasMore(result.hasMore);
    setPage(pageToLoad);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadPage(1);
      setLoading(false);
    })();
  }, [loadPage]);

  const handleEndReached = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await loadPage(page + 1);
    setLoadingMore(false);
  };

  const handleToggleWishlist = async (listingId: string) => {
    const nowSaved = await toggleWishlist(listingId);
    setWishlisted(current => {
      const next = new Set(current);
      if (nowSaved) {
        next.add(listingId);
      } else {
        next.delete(listingId);
      }
      return next;
    });
  };

  const openListing = (listingId: string) => {
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate('ListingDetail', { listingId });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Faira</Text>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No listings yet — be the first to sell something!</Text>
          </View>
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={styles.footerLoader} /> : null}
        renderItem={({ item }) => (
          <TouchableOpacity testID="listing-card" style={styles.card} onPress={() => openListing(item.id)}>
            <View style={styles.imageWrap}>
              {item.imageUrls[0] ? (
                <Image source={{ uri: item.imageUrls[0] }} style={styles.image} />
              ) : (
                <View style={[styles.image, styles.imagePlaceholder]} />
              )}
              <TouchableOpacity
                testID="wishlist-heart"
                style={styles.heart}
                onPress={() => handleToggleWishlist(item.id)}
              >
                <Text style={styles.heartText}>{wishlisted.has(item.id) ? '♥' : '♡'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.price}>${item.price}</Text>
            <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.city}>{item.city}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  header: { ...textStyles.h2, color: colors.primary, textAlign: 'center', paddingVertical: 16 },
  grid: { paddingHorizontal: 12, paddingBottom: 24 },
  row: { gap: 12 },
  card: { flex: 1, marginBottom: 16 },
  imageWrap: { position: 'relative' },
  image: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: colors.white },
  imagePlaceholder: { backgroundColor: colors.border },
  heart: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartText: { color: colors.primary, fontSize: 16 },
  price: { ...textStyles.bodyMedium, color: colors.text, marginTop: 8 },
  title: { ...textStyles.caption, color: colors.text },
  city: { ...textStyles.caption, color: colors.muted },
  empty: { paddingTop: 80, paddingHorizontal: 32, alignItems: 'center' },
  emptyText: { ...textStyles.body, color: colors.muted, textAlign: 'center' },
  footerLoader: { marginVertical: 16 },
});
