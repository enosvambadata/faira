import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { sellers as sellersApi, reviews as reviewsApi, SellerProfileData, SellerReview, ApiError } from '@/lib/api';
import ReportModal from '@/components/ReportModal';

type Props = NativeStackScreenProps<RootStackParamList, 'SellerProfile'>;

function joinedLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function reviewDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SellerProfileScreen({ route }: Props) {
  const { sellerId } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [profile, setProfile] = useState<SellerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);
  const [reviews, setReviews] = useState<SellerReview[]>([]);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [reviewsHasMore, setReviewsHasMore] = useState(false);
  const [reviewsLoadingMore, setReviewsLoadingMore] = useState(false);
  const [flaggingReviewId, setFlaggingReviewId] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [flagBusy, setFlagBusy] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, reviewsResult] = await Promise.all([sellersApi.get(sellerId), sellersApi.reviews(sellerId, 1)]);
      setProfile(data);
      setReviews(reviewsResult.data);
      setReviewsPage(1);
      setReviewsHasMore(reviewsResult.hasMore);
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

  const handleLoadMoreReviews = async () => {
    if (reviewsLoadingMore) return;
    setReviewsLoadingMore(true);
    try {
      const nextPage = reviewsPage + 1;
      const result = await sellersApi.reviews(sellerId, nextPage);
      setReviews(prev => [...prev, ...result.data]);
      setReviewsPage(nextPage);
      setReviewsHasMore(result.hasMore);
    } finally {
      setReviewsLoadingMore(false);
    }
  };

  const handleStartFlagging = (reviewId: string) => {
    setFlaggingReviewId(reviewId);
    setFlagReason('');
    setFlagError(null);
  };

  const handleSubmitFlag = async () => {
    if (!flaggingReviewId || !flagReason.trim()) {
      setFlagError('Tell us what\'s wrong with this review');
      return;
    }
    setFlagBusy(true);
    setFlagError(null);
    try {
      await reviewsApi.flag(flaggingReviewId, flagReason.trim());
      setReviews(prev => prev.filter(r => r.id !== flaggingReviewId));
      setFlaggingReviewId(null);
    } catch (err) {
      setFlagError(err instanceof ApiError ? err.message : 'Could not submit this report right now');
    } finally {
      setFlagBusy(false);
    }
  };

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
    <>
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

          <TouchableOpacity testID="report-seller-btn" style={styles.reportLink} onPress={() => setReportModalVisible(true)}>
            <Text style={styles.reportLinkText}>Report this seller</Text>
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
      ListFooterComponent={
        <View style={styles.reviewsSection}>
          <Text style={styles.sectionTitle}>Reviews</Text>
          {reviews.length === 0 ? (
            <Text style={styles.emptyText}>No reviews yet.</Text>
          ) : (
            reviews.map(review => (
              <View key={review.id} testID="seller-review-row" style={styles.reviewCard}>
                {review.reviewer.avatarUrl ? (
                  <Image source={{ uri: review.reviewer.avatarUrl }} style={styles.reviewAvatar} />
                ) : (
                  <View style={[styles.reviewAvatar, styles.avatarPlaceholder]} />
                )}
                <View style={styles.reviewBody}>
                  <View style={styles.reviewHeaderRow}>
                    <Text style={styles.reviewerName}>{review.reviewer.displayName ?? 'User'}</Text>
                    <Text style={styles.reviewStars}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</Text>
                  </View>
                  <Text style={styles.reviewDate}>{reviewDateLabel(review.createdAt)}</Text>
                  {review.comment && <Text style={styles.reviewComment}>{review.comment}</Text>}

                  {flaggingReviewId === review.id ? (
                    <View style={styles.flagForm}>
                      <TextInput
                        style={styles.flagInput}
                        placeholder="Why are you reporting this review?"
                        placeholderTextColor={colors.muted}
                        value={flagReason}
                        onChangeText={setFlagReason}
                        multiline
                      />
                      {flagError && <Text style={styles.flagError}>{flagError}</Text>}
                      <View style={styles.flagFormActions}>
                        <TouchableOpacity onPress={() => setFlaggingReviewId(null)} disabled={flagBusy}>
                          <Text style={styles.flagCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity testID="submit-flag-btn" onPress={handleSubmitFlag} disabled={flagBusy}>
                          {flagBusy ? (
                            <ActivityIndicator color={colors.red} />
                          ) : (
                            <Text style={styles.flagSubmitText}>Submit report</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity testID="flag-review-btn" onPress={() => handleStartFlagging(review.id)}>
                      <Text style={styles.flagLink}>Flag</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
          {reviewsHasMore && (
            <TouchableOpacity testID="load-more-reviews-btn" style={styles.loadMoreButton} onPress={handleLoadMoreReviews} disabled={reviewsLoadingMore}>
              {reviewsLoadingMore ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.loadMoreButtonText}>Load more reviews</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      }
    />
    <ReportModal
      visible={reportModalVisible}
      targetType="USER"
      targetId={sellerId}
      title="Report this seller"
      onClose={() => setReportModalVisible(false)}
    />
    </>
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
  reportLink: { marginTop: 12 },
  reportLinkText: { ...textStyles.caption, color: colors.muted, textDecorationLine: 'underline' },
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
  reviewsSection: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 24 },
  reviewCard: { flexDirection: 'row', gap: 10, backgroundColor: colors.white, borderRadius: 10, padding: 12, marginTop: 12 },
  reviewAvatar: { width: 40, height: 40, borderRadius: 20 },
  reviewBody: { flex: 1 },
  reviewHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewerName: { ...textStyles.bodyMedium, color: colors.text },
  reviewStars: { ...textStyles.body, color: colors.primary },
  reviewDate: { ...textStyles.caption, color: colors.muted, marginTop: 2 },
  reviewComment: { ...textStyles.body, color: colors.text, marginTop: 6 },
  loadMoreButton: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  loadMoreButtonText: { ...textStyles.bodyMedium, color: colors.primary },
  flagLink: { ...textStyles.caption, color: colors.muted, marginTop: 8, textDecorationLine: 'underline' },
  flagForm: { marginTop: 10, gap: 8 },
  flagInput: {
    ...textStyles.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  flagError: { ...textStyles.caption, color: colors.red },
  flagFormActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16 },
  flagCancelText: { ...textStyles.bodyMedium, color: colors.muted },
  flagSubmitText: { ...textStyles.bodyMedium, color: colors.red },
});
