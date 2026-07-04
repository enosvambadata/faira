import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { wishlist as wishlistApi, WishlistListing } from '@/lib/api';

export default function SavedItemsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<WishlistListing[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await wishlistApi.list();
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleRemove = async (listingId: string) => {
    setItems(current => current.filter(item => item.id !== listingId));
    await wishlistApi.remove(listingId);
  };

  const openListing = (listingId: string) => {
    navigation.navigate('ListingDetail', { listingId });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={item => item.id}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>You haven&apos;t saved anything yet.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity testID="saved-item" style={styles.card} onPress={() => openListing(item.id)}>
          {item.imageUrls[0] ? (
            <Image source={{ uri: item.imageUrls[0] }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]} />
          )}
          <View style={styles.info}>
            <View style={styles.headerRow}>
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
              {item.status === 'SOLD' && (
                <View testID="sold-badge" style={styles.soldBadge}>
                  <Text style={styles.soldBadgeText}>Sold</Text>
                </View>
              )}
            </View>
            <Text style={styles.price}>${item.price}</Text>
            <Text style={styles.city}>{item.city}</Text>
          </View>
          <TouchableOpacity testID="remove-saved-btn" style={styles.removeButton} onPress={() => handleRemove(item.id)}>
            <Text style={styles.removeButtonText}>♥</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { ...textStyles.body, color: colors.muted },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  image: { width: 64, height: 64, borderRadius: 8 },
  imagePlaceholder: { backgroundColor: colors.border },
  info: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...textStyles.bodyMedium, color: colors.text, flex: 1 },
  soldBadge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.border },
  soldBadgeText: { ...textStyles.caption, color: colors.muted },
  price: { ...textStyles.body, color: colors.text, marginTop: 4 },
  city: { ...textStyles.caption, color: colors.muted },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: { color: colors.primary, fontSize: 18 },
});
