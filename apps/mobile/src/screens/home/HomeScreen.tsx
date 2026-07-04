import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { categories as categoriesApi, listings as listingsApi, Category, ListingSummary, ListingFilters, EMPTY_LISTING_FILTERS } from '@/lib/api';
import { toggleWishlist } from '@/lib/wishlist';

const CONDITION_LABELS: Record<string, string> = {
  NEW: 'New',
  LIKE_NEW: 'Like New',
  GOOD: 'Good',
  FAIR: 'Fair',
};

interface ActiveChip {
  key: string;
  label: string;
  onRemove: () => void;
}

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [items, setItems] = useState<ListingSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [wishlisted, setWishlisted] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Category[]>([]);
  const [filters, setFilters] = useState<ListingFilters>(EMPTY_LISTING_FILTERS);

  useEffect(() => {
    categoriesApi.list().then(setCategories).catch(() => setCategories([]));
  }, []);

  const loadPage = useCallback(async (pageToLoad: number, activeFilters: ListingFilters) => {
    const result = await listingsApi.browse(pageToLoad, activeFilters);
    setItems(current => (pageToLoad === 1 ? result.data : [...current, ...result.data]));
    setHasMore(result.hasMore);
    setPage(pageToLoad);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadPage(1, filters);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const handleEndReached = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await loadPage(page + 1, filters);
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

  const openFilters = () => {
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate('Filters', {
      current: filters,
      onApply: setFilters,
    });
  };

  const activeChips: ActiveChip[] = [
    ...filters.categoryIds.map(id => ({
      key: `category:${id}`,
      label: categories.find(c => c.id === id)?.name ?? id,
      onRemove: () => setFilters(current => ({ ...current, categoryIds: current.categoryIds.filter(v => v !== id) })),
    })),
    ...filters.conditions.map(value => ({
      key: `condition:${value}`,
      label: CONDITION_LABELS[value] ?? value,
      onRemove: () => setFilters(current => ({ ...current, conditions: current.conditions.filter(v => v !== value) })),
    })),
    ...filters.sizes.map(value => ({
      key: `size:${value}`,
      label: `Size ${value}`,
      onRemove: () => setFilters(current => ({ ...current, sizes: current.sizes.filter(v => v !== value) })),
    })),
    ...filters.cities.map(value => ({
      key: `city:${value}`,
      label: value,
      onRemove: () => setFilters(current => ({ ...current, cities: current.cities.filter(v => v !== value) })),
    })),
    ...(filters.minPrice !== undefined || filters.maxPrice !== undefined
      ? [
          {
            key: 'price',
            label:
              filters.minPrice !== undefined && filters.maxPrice !== undefined
                ? `$${filters.minPrice} - $${filters.maxPrice}`
                : filters.minPrice !== undefined
                  ? `$${filters.minPrice}+`
                  : `Up to $${filters.maxPrice}`,
            onRemove: () => setFilters(current => ({ ...current, minPrice: undefined, maxPrice: undefined })),
          },
        ]
      : []),
  ];

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Faira</Text>
        <TouchableOpacity testID="open-filters-btn" style={styles.filterButton} onPress={openFilters}>
          <Text style={styles.filterButtonText}>Filters{activeChips.length > 0 ? ` (${activeChips.length})` : ''}</Text>
        </TouchableOpacity>
      </View>

      {activeChips.length > 0 && (
        <View style={styles.chipRow}>
          {activeChips.map(chip => (
            <TouchableOpacity key={chip.key} testID="active-filter-chip" style={styles.chip} onPress={chip.onRemove}>
              <Text style={styles.chipText}>{chip.label}</Text>
              <Text style={styles.chipRemove}>×</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

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
            <Text style={styles.emptyText}>
              {activeChips.length > 0 ? 'No listings match these filters.' : 'No listings yet — be the first to sell something!'}
            </Text>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, position: 'relative' },
  header: { ...textStyles.h2, color: colors.primary, textAlign: 'center' },
  filterButton: {
    position: 'absolute',
    right: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  filterButtonText: { ...textStyles.caption, color: colors.primary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
  },
  chipText: { ...textStyles.caption, color: colors.primary },
  chipRemove: { ...textStyles.caption, color: colors.primary, fontWeight: '700' },
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
