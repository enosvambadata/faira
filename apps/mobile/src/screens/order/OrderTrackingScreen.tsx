import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { orders as ordersApi, OrderDetail, ApiError } from '@/lib/api';

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

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await ordersApi.get(orderId);
      setOrder(data);
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
});
