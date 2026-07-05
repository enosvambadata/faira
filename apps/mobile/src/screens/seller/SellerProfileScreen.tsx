import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { sellers as sellersApi, SellerProfileData } from '@/lib/api';

type Props = NativeStackScreenProps<RootStackParamList, 'SellerProfile'>;

function joinedLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function SellerProfileScreen({ route }: Props) {
  const { sellerId } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [profile, setProfile] = useState<SellerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await sellersApi.get(sellerId);
      setProfile(data);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleToggleFollow = async () => {
    if (!profile || followBusy) return;
    const wasFollowing = profile.isFollowing;
    setFollowBusy(true);
    setProfile({
      ...profile,
      isFollowing: !wasFollowing,
      followerCount: profile.followerCount + (wasFollowing ? -1 : 1),
    });
    try {
      if (wasFollowing) {
        await sellersApi.unfollow(sellerId);
      } else {
        await sellersApi.follow(sellerId);
      }
    } catch {
      setProfile(profile);
    } finally {
      setFollowBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Could not load this seller&apos;s profile.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={profile.activeListings}
      keyExtractor={item => item.id}
      numColumns={2}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.grid}
      ListHeaderComponent={
        <View style={styles.header}>
          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]} />
          )}
          <View style={styles.nameRow}>
            <Text style={styles.name}>{profile.displayName ?? 'Seller'}</Text>
            {profile.isVerified && (
              <View testID="verified-badge" style={styles.verifiedBadge}>
                <Text style={styles.verifiedBadgeText}>✓ Verified</Text>
              </View>
            )}
          </View>
          {profile.city && <Text style={styles.city}>{profile.city}</Text>}
          <Text style={styles.joined}>Joined {joinedLabel(profile.joinedAt)}</Text>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text testID="seller-rating" style={styles.statValue}>
                {profile.ratingCount > 0 ? `★ ${profile.ratingAvg}` : '★ —'}
              </Text>
              <Text style={styles.statLabel}>{profile.ratingCount} rating{profile.ratingCount === 1 ? '' : 's'}</Text>
            </View>
            <View style={styles.stat}>
              <Text testID="seller-sales-count" style={styles.statValue}>{profile.salesCount}</Text>
              <Text style={styles.statLabel}>Sales</Text>
            </View>
            <View style={styles.stat}>
              <Text testID="seller-response-rate" style={styles.statValue}>
                {profile.responseRate === null ? '—' : `${profile.responseRate}%`}
              </Text>
              <Text style={styles.statLabel}>Response rate</Text>
            </View>
            <View style={styles.stat}>
              <Text testID="seller-follower-count" style={styles.statValue}>{profile.followerCount}</Text>
              <Text style={styles.statLabel}>Follower{profile.followerCount === 1 ? '' : 's'}</Text>
            </View>
          </View>

          <TouchableOpacity
            testID="follow-toggle-btn"
            style={[styles.followButton, profile.isFollowing && styles.followButtonActive]}
            onPress={handleToggleFollow}
            disabled={followBusy}
          >
            <Text style={[styles.followButtonText, profile.isFollowing && styles.followButtonTextActive]}>
              {profile.isFollowing ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Active Listings</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No active listings right now.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          testID="seller-listing-card"
          style={styles.card}
          onPress={() => navigation.navigate('ListingDetail', { listingId: item.id })}
        >
          {item.imageUrls[0] ? (
            <Image source={{ uri: item.imageUrls[0] }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]} />
          )}
          <Text style={styles.price}>${item.price}</Text>
          <Text style={styles.listingTitle} numberOfLines={1}>{item.title}</Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  errorText: { ...textStyles.body, color: colors.red, textAlign: 'center', paddingHorizontal: 24 },
  container: { flex: 1, backgroundColor: colors.bg },
  header: { alignItems: 'center', paddingTop: 24, paddingBottom: 12, paddingHorizontal: 16 },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarPlaceholder: { backgroundColor: colors.border },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  name: { ...textStyles.h2, color: colors.text },
  verifiedBadge: { backgroundColor: colors.primaryLight, borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8 },
  verifiedBadgeText: { ...textStyles.caption, color: colors.primary, fontWeight: '600' },
  city: { ...textStyles.body, color: colors.muted, marginTop: 2 },
  joined: { ...textStyles.caption, color: colors.muted, marginTop: 2 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 20 },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { ...textStyles.bodyMedium, color: colors.text },
  statLabel: { ...textStyles.caption, color: colors.muted, marginTop: 2, textAlign: 'center' },
  followButton: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  followButtonActive: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.primary },
  followButtonText: { ...textStyles.bodyMedium, color: colors.white },
  followButtonTextActive: { color: colors.primary },
  sectionTitle: { ...textStyles.bodyMedium, color: colors.text, alignSelf: 'flex-start', marginTop: 28 },
  grid: { paddingHorizontal: 12, paddingBottom: 24 },
  row: { gap: 12 },
  empty: { paddingTop: 40, alignItems: 'center' },
  emptyText: { ...textStyles.body, color: colors.muted },
  card: { flex: 1, marginBottom: 16, marginTop: 12 },
  image: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: colors.white },
  imagePlaceholder: { backgroundColor: colors.border },
  price: { ...textStyles.bodyMedium, color: colors.text, marginTop: 8 },
  listingTitle: { ...textStyles.caption, color: colors.muted },
});
