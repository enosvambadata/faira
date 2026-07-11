import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { orders as ordersApi, reviews as reviewsApi, OrderDetail, OrderReviewsResult, ApiError } from '@/lib/api';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderTracking'>;

const SHIPPING_METHOD_LABELS: Record<string, string> = {
  MEETUP: 'In-person meetup',
  COURIER: 'Courier',
  POSTAL: 'Postal',
};

function formatTimelineDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function OrderTrackingScreen({ route, navigation }: Props) {
  const { orderId } = route.params;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<OrderReviewsResult | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [flagging, setFlagging] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [flagBusy, setFlagBusy] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await ordersApi.get(orderId);
      setOrder(data);
      if (data.status === 'COMPLETED') {
        setReviews(await ordersApi.getReviews(orderId));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this order');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleMessageSeller = () => {
    if (!order) return;
    navigation.navigate('Chat', { listingId: order.listing.id });
  };

  const handleConfirmReceipt = async () => {
    setConfirming(true);
    setConfirmError(null);
    try {
      await ordersApi.confirmDelivery(orderId);
      await load();
    } catch (err) {
      setConfirmError(err instanceof ApiError ? err.message : 'Could not confirm receipt right now');
    } finally {
      setConfirming(false);
    }
  };

  const handleMarkCollected = async () => {
    setCollecting(true);
    setCollectError(null);
    try {
      await ordersApi.markCollected(orderId);
      await load();
    } catch (err) {
      setCollectError(err instanceof ApiError ? err.message : 'Could not mark this order as collected right now');
    } finally {
      setCollecting(false);
    }
  };

  const handleSubmitReview = async () => {
    if (reviewRating === 0) {
      setReviewError('Pick a star rating first');
      return;
    }
    setSubmittingReview(true);
    setReviewError(null);
    try {
      await ordersApi.submitReview(orderId, { rating: reviewRating, comment: reviewComment.trim() || undefined });
      setReviews(await ordersApi.getReviews(orderId));
    } catch (err) {
      setReviewError(err instanceof ApiError ? err.message : 'Could not submit your review right now');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleSubmitFlag = async () => {
    if (!reviews?.counterpartReview || !flagReason.trim()) {
      setFlagError('Tell us what\'s wrong with this review');
      return;
    }
    setFlagBusy(true);
    setFlagError(null);
    try {
      await reviewsApi.flag(reviews.counterpartReview.id, flagReason.trim());
      setFlagged(true);
      setFlagging(false);
    } catch (err) {
      setFlagError(err instanceof ApiError ? err.message : 'Could not submit this report right now');
    } finally {
      setFlagBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error ?? 'Order not found'}</Text>
      </View>
    );
  }

  const canConfirmReceipt = order.status === 'SHIPPED' || order.status === 'DELIVERED';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.itemRow}>
        {order.listing.imageUrl ? (
          <Image source={{ uri: order.listing.imageUrl }} style={styles.itemImage} />
        ) : (
          <View style={[styles.itemImage, styles.itemImagePlaceholder]} />
        )}
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle}>{order.listing.title}</Text>
          <Text style={styles.itemPrice}>${order.priceAtPurchase}</Text>
        </View>
      </View>

      <View style={styles.statusBadge}>
        <Text style={styles.statusBadgeText}>{order.displayStatus}</Text>
      </View>

      <View style={styles.detailBox}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Delivery option</Text>
          <Text style={styles.detailValue}>{order.deliveryOption}</Text>
        </View>
        {order.shippingMethod && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Shipping method</Text>
            <Text style={styles.detailValue}>{SHIPPING_METHOD_LABELS[order.shippingMethod] ?? order.shippingMethod}</Text>
          </View>
        )}
        {order.trackingReference && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Tracking reference</Text>
            <Text style={styles.detailValue}>{order.trackingReference}</Text>
          </View>
        )}
      </View>

      <Text style={styles.sectionTitle}>Order timeline</Text>
      <View style={styles.timeline}>
        {(order.timeline ?? []).map((entry, index, timeline) => (
          <View key={entry.status} style={styles.timelineRow}>
            <View style={styles.timelineMarkerColumn}>
              <View style={styles.timelineDot} />
              {index < timeline.length - 1 && <View style={styles.timelineLine} />}
            </View>
            <View style={styles.timelineTextColumn}>
              <Text style={styles.timelineLabel}>{entry.label}</Text>
              <Text style={styles.timelineDate}>{formatTimelineDate(entry.at)}</Text>
            </View>
          </View>
        ))}
      </View>

      {order.status === 'COMPLETED' && reviews && (
        <View style={styles.reviewSection}>
          <Text style={styles.sectionTitle}>Reviews</Text>

          {reviews.canReview ? (
            <View style={styles.reviewBox}>
              <Text style={styles.reviewPrompt}>How was this order?</Text>
              <View style={styles.starRow}>
                {[1, 2, 3, 4, 5].map(star => (
                  <TouchableOpacity key={star} onPress={() => setReviewRating(star)}>
                    <Text style={styles.starIcon}>{star <= reviewRating ? '★' : '☆'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.reviewInput}
                placeholder="Add a comment (optional)"
                placeholderTextColor={colors.muted}
                value={reviewComment}
                onChangeText={setReviewComment}
                multiline
              />
              {reviewError && <Text style={styles.submitError}>{reviewError}</Text>}
              <TouchableOpacity
                style={[styles.confirmButton, submittingReview && styles.confirmButtonDisabled]}
                disabled={submittingReview}
                onPress={handleSubmitReview}
              >
                {submittingReview ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.confirmButtonText}>Submit Review</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            reviews.yourReview && (
              <View style={styles.reviewBox}>
                <Text style={styles.reviewPrompt}>Your review</Text>
                <Text style={styles.starIcon}>{'★'.repeat(reviews.yourReview.rating)}{'☆'.repeat(5 - reviews.yourReview.rating)}</Text>
                {reviews.yourReview.comment && <Text style={styles.reviewComment}>{reviews.yourReview.comment}</Text>}
                {reviews.yourReview.flagged && <Text style={styles.reviewWaiting}>This review was flagged and is under admin review.</Text>}
              </View>
            )
          )}

          {reviews.revealed && reviews.counterpartReview ? (
            <View style={styles.reviewBox}>
              <Text style={styles.reviewPrompt}>Their review of you</Text>
              <Text style={styles.starIcon}>
                {'★'.repeat(reviews.counterpartReview.rating)}
                {'☆'.repeat(5 - reviews.counterpartReview.rating)}
              </Text>
              {reviews.counterpartReview.comment && <Text style={styles.reviewComment}>{reviews.counterpartReview.comment}</Text>}

              {flagged ? (
                <Text style={styles.reviewWaiting}>Reported. An admin will review this.</Text>
              ) : flagging ? (
                <View style={styles.flagForm}>
                  <TextInput
                    style={styles.flagInput}
                    placeholder="Why are you reporting this review?"
                    placeholderTextColor={colors.muted}
                    value={flagReason}
                    onChangeText={setFlagReason}
                    multiline
                  />
                  {flagError && <Text style={styles.submitError}>{flagError}</Text>}
                  <View style={styles.flagFormActions}>
                    <TouchableOpacity onPress={() => setFlagging(false)} disabled={flagBusy}>
                      <Text style={styles.flagCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity testID="submit-flag-btn" onPress={handleSubmitFlag} disabled={flagBusy}>
                      {flagBusy ? <ActivityIndicator color={colors.red} /> : <Text style={styles.flagSubmitText}>Submit report</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity testID="flag-review-btn" onPress={() => setFlagging(true)}>
                  <Text style={styles.flagLink}>Flag</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            !reviews.canReview && (
              <Text style={styles.reviewWaiting}>
                Their review will be revealed once they submit theirs, or after 7 days.
              </Text>
            )
          )}
        </View>
      )}

      {confirmError && <Text style={styles.submitError}>{confirmError}</Text>}

      {canConfirmReceipt && (
        <TouchableOpacity
          style={[styles.confirmButton, confirming && styles.confirmButtonDisabled]}
          disabled={confirming}
          onPress={handleConfirmReceipt}
        >
          {confirming ? <ActivityIndicator color={colors.white} /> : <Text style={styles.confirmButtonText}>Confirm Receipt</Text>}
        </TouchableOpacity>
      )}

      {collectError && <Text style={styles.submitError}>{collectError}</Text>}

      {order.canMarkCollected && (
        <TouchableOpacity
          style={[styles.confirmButton, collecting && styles.confirmButtonDisabled]}
          disabled={collecting}
          onPress={handleMarkCollected}
        >
          {collecting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.confirmButtonText}>Mark as Collected</Text>}
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.messageButton} onPress={handleMessageSeller}>
        <Text style={styles.messageButtonText}>Message Seller</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  error: { ...textStyles.body, color: colors.red },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemImage: { width: 64, height: 64, borderRadius: 10 },
  itemImagePlaceholder: { backgroundColor: colors.border },
  itemInfo: { flex: 1 },
  itemTitle: { ...textStyles.bodyMedium, color: colors.text },
  itemPrice: { ...textStyles.bodyMedium, color: colors.primary, marginTop: 4 },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  statusBadgeText: { ...textStyles.bodyMedium, color: colors.primary },
  detailBox: { backgroundColor: colors.white, borderRadius: 10, padding: 16, marginTop: 16, gap: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { ...textStyles.body, color: colors.muted },
  detailValue: { ...textStyles.body, color: colors.text },
  sectionTitle: { ...textStyles.bodyMedium, color: colors.text, marginTop: 24, marginBottom: 12 },
  timeline: { backgroundColor: colors.white, borderRadius: 10, padding: 16 },
  timelineRow: { flexDirection: 'row' },
  timelineMarkerColumn: { alignItems: 'center', width: 16 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  timelineLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2, minHeight: 20 },
  timelineTextColumn: { flex: 1, marginLeft: 12, paddingBottom: 16 },
  timelineLabel: { ...textStyles.bodyMedium, color: colors.text },
  timelineDate: { ...textStyles.caption, color: colors.muted, marginTop: 2 },
  submitError: { ...textStyles.body, color: colors.red, marginTop: 20, textAlign: 'center' },
  confirmButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  confirmButtonDisabled: { opacity: 0.5 },
  confirmButtonText: { ...textStyles.bodyMedium, color: colors.white, fontSize: 17 },
  messageButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  messageButtonText: { ...textStyles.bodyMedium, color: colors.primary, fontSize: 17 },
  reviewSection: { marginTop: 8 },
  reviewBox: { backgroundColor: colors.white, borderRadius: 10, padding: 16, marginBottom: 12, gap: 10 },
  reviewPrompt: { ...textStyles.bodyMedium, color: colors.text },
  starRow: { flexDirection: 'row', gap: 6 },
  starIcon: { fontSize: 24, color: colors.primary },
  reviewInput: {
    ...textStyles.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  reviewComment: { ...textStyles.body, color: colors.text },
  reviewWaiting: { ...textStyles.body, color: colors.muted, textAlign: 'center', marginBottom: 12 },
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
  flagFormActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16 },
  flagCancelText: { ...textStyles.bodyMedium, color: colors.muted },
  flagSubmitText: { ...textStyles.bodyMedium, color: colors.red },
});
