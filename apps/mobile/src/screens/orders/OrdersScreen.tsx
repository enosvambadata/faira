import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { orders as ordersApi, OrderListItem } from '@/lib/api';

type Tab = 'purchases' | 'sales';

export default function OrdersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [tab, setTab] = useState<Tab>('purchases');
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (which: Tab) => {
    setLoading(true);
    try {
      const data = which === 'purchases' ? await ordersApi.purchases() : await ordersApi.sales();
      setOrders(data);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(tab);
    }, [load, tab]),
  );

  const openOrder = (orderId: string) => {
    navigation.navigate('OrderTracking', { orderId });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Orders</Text>

      <View style={styles.tabRow}>
        <TouchableOpacity
          testID="purchases-tab"
          style={[styles.tab, tab === 'purchases' && styles.tabActive]}
          onPress={() => setTab('purchases')}
        >
          <Text style={[styles.tabText, tab === 'purchases' && styles.tabTextActive]}>Purchases</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="sales-tab"
          style={[styles.tab, tab === 'sales' && styles.tabActive]}
          onPress={() => setTab('sales')}
        >
          <Text style={[styles.tabText, tab === 'sales' && styles.tabTextActive]}>Sales</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {tab === 'purchases' ? "You haven't bought anything yet." : "You haven't sold anything yet."}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity testID="order-row" style={styles.orderCard} onPress={() => openOrder(item.id)}>
              {item.listing.imageUrl ? (
                <Image source={{ uri: item.listing.imageUrl }} style={styles.orderImage} />
              ) : (
                <View style={[styles.orderImage, styles.orderImagePlaceholder]} />
              )}
              <View style={styles.orderInfo}>
                <Text style={styles.orderTitle} numberOfLines={1}>{item.listing.title}</Text>
                <Text style={styles.orderPrice}>${item.priceAtPurchase}</Text>
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>{item.displayStatus}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 16 },
  title: { ...textStyles.h2, color: colors.text, textAlign: 'center' },
  tabRow: { flexDirection: 'row', marginTop: 16, marginHorizontal: 20, gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  tabText: { ...textStyles.bodyMedium, color: colors.muted },
  tabTextActive: { color: colors.primary },
  loader: { marginTop: 40 },
  list: { padding: 20, paddingTop: 16 },
  emptyText: { ...textStyles.body, color: colors.muted, textAlign: 'center', marginTop: 24 },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  orderImage: { width: 56, height: 56, borderRadius: 8 },
  orderImagePlaceholder: { backgroundColor: colors.border },
  orderInfo: { flex: 1 },
  orderTitle: { ...textStyles.bodyMedium, color: colors.text },
  orderPrice: { ...textStyles.body, color: colors.primary, marginTop: 4 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.primaryLight },
  statusBadgeText: { ...textStyles.caption, color: colors.primary },
});
