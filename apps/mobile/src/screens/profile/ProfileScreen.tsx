import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { listings as listingsApi, MyListing } from '@/lib/api';
import ProfileForm from './ProfileForm';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  SOLD: 'Sold',
  ARCHIVED: 'Archived',
};

export default function ProfileScreen() {
  const navigation = useNavigation();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [myListings, setMyListings] = useState<MyListing[]>([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadMyListings = useCallback(async () => {
    setLoadingListings(true);
    try {
      const data = await listingsApi.mine();
      setMyListings(data);
    } catch {
      setMyListings([]);
    } finally {
      setLoadingListings(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMyListings();
    }, [loadMyListings]),
  );

  const handleEdit = (listingId: string) => {
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate('EditListing', { listingId });
  };

  const openSavedItems = () => {
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate('SavedItems');
  };

  const openVerification = () => {
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate('SellerVerification');
  };

  const handleMarkSold = async (listingId: string) => {
    setBusyId(listingId);
    try {
      await listingsApi.markSold(listingId);
      setMyListings(current => current.map(item => (item.id === listingId ? { ...item, status: 'SOLD' } : item)));
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDelete = async (listingId: string) => {
    setBusyId(listingId);
    try {
      await listingsApi.remove(listingId);
      setMyListings(current => current.filter(item => item.id !== listingId));
      setConfirmDeleteId(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={myListings}
      keyExtractor={item => item.id}
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>Profile</Text>
          {savedAt !== null && <Text style={styles.savedBanner}>Saved</Text>}
          <ProfileForm submitLabel="Save Changes" onSaved={() => setSavedAt(Date.now())} />

          <TouchableOpacity testID="saved-items-btn" style={styles.savedItemsButton} onPress={openSavedItems}>
            <Text style={styles.savedItemsButtonText}>♥ Saved Items</Text>
          </TouchableOpacity>

          <TouchableOpacity testID="get-verified-btn" style={styles.savedItemsButton} onPress={openVerification}>
            <Text style={styles.savedItemsButtonText}>✓ Get Verified</Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>My Listings</Text>
          {loadingListings && <ActivityIndicator color={colors.primary} style={styles.listingsLoader} />}
          {!loadingListings && myListings.length === 0 && (
            <Text style={styles.emptyText}>You haven&apos;t listed anything yet.</Text>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <View testID="my-listing-item" style={styles.listingCard}>
          {item.imageUrls[0] ? (
            <Image source={{ uri: item.imageUrls[0] }} style={styles.listingImage} />
          ) : (
            <View style={[styles.listingImage, styles.listingImagePlaceholder]} />
          )}
          <View style={styles.listingInfo}>
            <View style={styles.listingHeaderRow}>
              <Text style={styles.listingTitle} numberOfLines={1}>{item.title}</Text>
              <View testID="listing-status-badge" style={[styles.badge, item.status === 'SOLD' && styles.badgeSold]}>
                <Text style={[styles.badgeText, item.status === 'SOLD' && styles.badgeTextSold]}>
                  {STATUS_LABELS[item.status] ?? item.status}
                </Text>
              </View>
            </View>
            <Text style={styles.listingPrice}>${item.price}</Text>

            {confirmDeleteId === item.id ? (
              <View style={styles.confirmRow}>
                <Text style={styles.confirmText}>Delete this listing?</Text>
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    testID="confirm-delete-btn"
                    style={styles.dangerButton}
                    onPress={() => handleConfirmDelete(item.id)}
                    disabled={busyId === item.id}
                  >
                    {busyId === item.id ? (
                      <ActivityIndicator color={colors.white} size="small" />
                    ) : (
                      <Text style={styles.dangerButtonText}>Yes, delete</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="cancel-delete-btn"
                    style={styles.secondaryButton}
                    onPress={() => setConfirmDeleteId(null)}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.actionRow}>
                <TouchableOpacity testID="edit-listing-btn" style={styles.secondaryButton} onPress={() => handleEdit(item.id)}>
                  <Text style={styles.secondaryButtonText}>Edit</Text>
                </TouchableOpacity>
                {item.status === 'ACTIVE' && (
                  <TouchableOpacity
                    testID="mark-sold-btn"
                    style={styles.secondaryButton}
                    onPress={() => handleMarkSold(item.id)}
                    disabled={busyId === item.id}
                  >
                    {busyId === item.id ? (
                      <ActivityIndicator color={colors.primary} size="small" />
                    ) : (
                      <Text style={styles.secondaryButtonText}>Mark Sold</Text>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  testID="delete-listing-btn"
                  style={styles.secondaryButton}
                  onPress={() => setConfirmDeleteId(item.id)}
                >
                  <Text style={[styles.secondaryButtonText, styles.deleteText]}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: 16, paddingHorizontal: 20, paddingBottom: 40 },
  title: { ...textStyles.h2, color: colors.text, textAlign: 'center' },
  savedBanner: { ...textStyles.caption, color: colors.green, textAlign: 'center', marginTop: 4 },
  savedItemsButton: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  savedItemsButtonText: { ...textStyles.bodyMedium, color: colors.primary },
  sectionTitle: { ...textStyles.h3, color: colors.text, marginTop: 32, marginBottom: 12 },
  listingsLoader: { marginTop: 12 },
  emptyText: { ...textStyles.body, color: colors.muted },
  listingCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  listingImage: { width: 64, height: 64, borderRadius: 8 },
  listingImagePlaceholder: { backgroundColor: colors.border },
  listingInfo: { flex: 1 },
  listingHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  listingTitle: { ...textStyles.bodyMedium, color: colors.text, flex: 1 },
  listingPrice: { ...textStyles.body, color: colors.text, marginTop: 4 },
  badge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.primaryLight },
  badgeSold: { backgroundColor: colors.border },
  badgeText: { ...textStyles.caption, color: colors.primary },
  badgeTextSold: { color: colors.muted },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  secondaryButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: { ...textStyles.caption, color: colors.text },
  deleteText: { color: colors.red },
  confirmRow: { marginTop: 8 },
  confirmText: { ...textStyles.caption, color: colors.text },
  dangerButton: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.red },
  dangerButtonText: { ...textStyles.caption, color: colors.white },
});
