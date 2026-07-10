import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { listings as listingsApi, orders as ordersApi, ListingDetail, PaymentMethod, ApiError } from '@/lib/api';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;

// Matches escrowRelease.ts's COMMISSION_RATE — shown here for transparency
// only. It's deducted from the seller's payout at release time, not added
// to what the buyer pays, so it's excluded from the total below.
const PLATFORM_FEE_RATE = 0.05;

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'ECOCASH', label: 'EcoCash' },
  { value: 'ONEMONEY', label: 'OneMoney' },
  { value: 'ZIMSWITCH', label: 'Card / Zimswitch' },
  { value: 'CASH_ON_DELIVERY', label: 'Cash on Delivery' },
];

type Outcome =
  | { kind: 'cod'; orderId: string }
  | { kind: 'redirect'; url: string; orderId: string }
  | { kind: 'mobile'; instructions: string; orderId: string };

export default function CheckoutScreen({ route, navigation }: Props) {
  const { listingId } = route.params;

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [deliveryOption, setDeliveryOption] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryFeeLoading, setDeliveryFeeLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await listingsApi.get(listingId);
        setListing(data);
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : 'Could not load this listing');
      } finally {
        setLoading(false);
      }
    })();
  }, [listingId]);

  // Re-quoted whenever the buyer changes the delivery option — "Buyer
  // collects" is always free, everything else depends on the buyer's
  // profile city and the listing's weight tier (SCRUM-64).
  useEffect(() => {
    if (!deliveryOption) {
      setDeliveryFee(0);
      return;
    }
    let cancelled = false;
    setDeliveryFeeLoading(true);
    ordersApi
      .deliveryFeeQuote(listingId, deliveryOption)
      .then(result => {
        if (!cancelled) setDeliveryFee(result.fee);
      })
      .catch(() => {
        if (!cancelled) setDeliveryFee(0);
      })
      .finally(() => {
        if (!cancelled) setDeliveryFeeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listingId, deliveryOption]);

  const itemPrice = listing ? Number(listing.price) : 0;
  const total = itemPrice + deliveryFee;
  const platformFee = Math.round(itemPrice * PLATFORM_FEE_RATE * 100) / 100;

  const handleConfirm = async () => {
    const nextErrors: Record<string, string> = {};
    if (!deliveryOption) nextErrors.deliveryOption = 'Choose a delivery option';
    if (!paymentMethod) nextErrors.paymentMethod = 'Choose a payment method';
    if (paymentMethod && paymentMethod !== 'CASH_ON_DELIVERY' && !email.trim()) {
      nextErrors.email = 'Email is required for this payment method';
    }
    if ((paymentMethod === 'ECOCASH' || paymentMethod === 'ONEMONEY') && !phone.trim()) {
      nextErrors.phone = 'Phone number is required for mobile money';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const order = await ordersApi.create({ listingId, deliveryOption });
      const payResult = await ordersApi.pay(order.id, {
        method: paymentMethod as PaymentMethod,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });

      if (paymentMethod === 'CASH_ON_DELIVERY') {
        setOutcome({ kind: 'cod', orderId: order.id });
      } else if (payResult.redirectUrl) {
        setOutcome({ kind: 'redirect', url: payResult.redirectUrl, orderId: order.id });
        Linking.openURL(payResult.redirectUrl);
      } else {
        setOutcome({ kind: 'mobile', instructions: payResult.instructions ?? 'Follow the prompt on your phone to complete payment.', orderId: order.id });
      }
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Something went wrong placing your order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckStatus = async (orderId: string) => {
    setCheckingStatus(true);
    try {
      const result = await ordersApi.paymentStatus(orderId);
      setStatusMessage(
        result.paymentStatus === 'CONFIRMED'
          ? 'Payment confirmed! Your order is on its way.'
          : `Payment status: ${result.paymentStatus ?? 'pending'}. Check back shortly.`,
      );
    } catch {
      setStatusMessage('Could not check status right now — try again in a moment.');
    } finally {
      setCheckingStatus(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (loadError || !listing) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{loadError ?? 'Listing not found'}</Text>
      </View>
    );
  }

  if (outcome) {
    return (
      <View style={styles.container}>
        <View style={styles.outcomeBox}>
          {outcome.kind === 'cod' && (
            <>
              <Text style={styles.outcomeTitle}>Order placed</Text>
              <Text style={styles.outcomeBody}>Pay in cash when your order is delivered.</Text>
            </>
          )}
          {outcome.kind === 'redirect' && (
            <>
              <Text style={styles.outcomeTitle}>Complete payment in your browser</Text>
              <Text style={styles.outcomeBody}>
                We opened the payment page for you. Come back here once you&apos;re done.
              </Text>
              <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(outcome.url)}>
                <Text style={styles.linkButtonText}>Reopen payment page</Text>
              </TouchableOpacity>
            </>
          )}
          {outcome.kind === 'mobile' && (
            <>
              <Text style={styles.outcomeTitle}>Approve payment on your phone</Text>
              <Text style={styles.outcomeBody}>{outcome.instructions}</Text>
              <TouchableOpacity
                style={styles.submitButton}
                disabled={checkingStatus}
                onPress={() => handleCheckStatus(outcome.orderId)}
              >
                {checkingStatus ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.submitButtonText}>I&apos;ve paid — check status</Text>
                )}
              </TouchableOpacity>
              {statusMessage && <Text style={styles.statusMessage}>{statusMessage}</Text>}
            </>
          )}
          <TouchableOpacity
            style={styles.submitButton}
            onPress={() => navigation.replace('OrderTracking', { orderId: outcome.orderId })}
          >
            <Text style={styles.submitButtonText}>Track Order</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.doneButton} onPress={() => navigation.popToTop()}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Checkout</Text>

      <View style={styles.itemRow}>
        <Text style={styles.itemTitle}>{listing.title}</Text>
        <Text style={styles.itemPrice}>${listing.price}</Text>
      </View>

      <Text style={styles.label}>Delivery option</Text>
      <View style={styles.chipRow}>
        {listing.deliveryOptions.map(option => (
          <TouchableOpacity
            key={option}
            style={[styles.chip, deliveryOption === option && styles.chipSelected]}
            onPress={() => setDeliveryOption(option)}
          >
            <Text style={[styles.chipText, deliveryOption === option && styles.chipTextSelected]}>{option}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {errors.deliveryOption && <Text style={styles.error}>{errors.deliveryOption}</Text>}

      <Text style={styles.label}>Payment method</Text>
      <View style={styles.chipRow}>
        {PAYMENT_METHODS.map(({ value, label }) => (
          <TouchableOpacity
            key={value}
            style={[styles.chip, paymentMethod === value && styles.chipSelected]}
            onPress={() => setPaymentMethod(value)}
          >
            <Text style={[styles.chipText, paymentMethod === value && styles.chipTextSelected]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {errors.paymentMethod && <Text style={styles.error}>{errors.paymentMethod}</Text>}

      {paymentMethod && paymentMethod !== 'CASH_ON_DELIVERY' && (
        <>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {errors.email && <Text style={styles.error}>{errors.email}</Text>}
        </>
      )}

      {(paymentMethod === 'ECOCASH' || paymentMethod === 'ONEMONEY') && (
        <>
          <Text style={styles.label}>Phone number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="0771234567"
            keyboardType="phone-pad"
          />
          {errors.phone && <Text style={styles.error}>{errors.phone}</Text>}
        </>
      )}

      <View style={styles.summaryBox}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Item price</Text>
          <Text style={styles.summaryValue}>${itemPrice.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Delivery fee</Text>
          {deliveryFeeLoading ? (
            <ActivityIndicator size="small" color={colors.muted} />
          ) : (
            <Text style={styles.summaryValue}>${deliveryFee.toFixed(2)}</Text>
          )}
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Platform fee (paid by seller)</Text>
          <Text style={styles.summaryValueMuted}>${platformFee.toFixed(2)}</Text>
        </View>
        <View style={[styles.summaryRow, styles.summaryTotalRow]}>
          <Text style={styles.summaryTotalLabel}>Total</Text>
          <Text style={styles.summaryTotalValue}>${total.toFixed(2)}</Text>
        </View>
      </View>

      {submitError && <Text style={styles.submitError}>{submitError}</Text>}

      <TouchableOpacity
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        disabled={submitting}
        onPress={handleConfirm}
      >
        {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitButtonText}>Confirm order</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  title: { ...textStyles.h2, color: colors.text, marginBottom: 16 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 14,
  },
  itemTitle: { ...textStyles.bodyMedium, color: colors.text, flex: 1, marginRight: 12 },
  itemPrice: { ...textStyles.bodyMedium, color: colors.primary },
  label: { ...textStyles.bodyMedium, color: colors.text, marginTop: 20, marginBottom: 8 },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...textStyles.body,
    color: colors.text,
  },
  error: { ...textStyles.caption, color: colors.red, marginTop: 6 },
  submitError: { ...textStyles.body, color: colors.red, marginTop: 20, textAlign: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { ...textStyles.body, color: colors.text },
  chipTextSelected: { color: colors.primary },
  summaryBox: {
    marginTop: 24,
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 16,
    gap: 10,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { ...textStyles.body, color: colors.muted },
  summaryValue: { ...textStyles.body, color: colors.text },
  summaryValueMuted: { ...textStyles.caption, color: colors.muted },
  summaryTotalRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 4 },
  summaryTotalLabel: { ...textStyles.bodyMedium, color: colors.text, fontSize: 17 },
  summaryTotalValue: { ...textStyles.bodyMedium, color: colors.primary, fontSize: 17 },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { ...textStyles.bodyMedium, color: colors.white, fontSize: 17 },
  outcomeBox: { flex: 1, padding: 20, justifyContent: 'center' },
  outcomeTitle: { ...textStyles.h3, color: colors.text, textAlign: 'center' },
  outcomeBody: { ...textStyles.body, color: colors.muted, textAlign: 'center', marginTop: 12 },
  statusMessage: { ...textStyles.body, color: colors.text, textAlign: 'center', marginTop: 16 },
  linkButton: {
    marginTop: 20,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  linkButtonText: { ...textStyles.bodyMedium, color: colors.primary },
  doneButton: { marginTop: 20, alignItems: 'center', paddingVertical: 12 },
  doneButtonText: { ...textStyles.bodyMedium, color: colors.primary },
});
