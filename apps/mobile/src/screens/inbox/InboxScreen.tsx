import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, ActivityIndicator, Animated, PanResponder } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { conversations as conversationsApi, ConversationListItem } from '@/lib/api';
import { useUnreadCount } from '@/lib/unreadCount';

const ARCHIVE_THRESHOLD = -80;
const SWIPE_OUT_DISTANCE = -400;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function previewText(item: ConversationListItem): string {
  if (!item.lastMessage) return 'Say hello to get started';
  if (item.lastMessage.body) return item.lastMessage.body;
  if (item.lastMessage.imageUrl) return '📷 Photo';
  return '';
}

interface RowProps {
  item: ConversationListItem;
  onPress: () => void;
  onArchive: () => void;
}

const TAP_MOVE_TOLERANCE = 8;

function InboxRow({ item, onPress, onArchive }: RowProps) {
  const translateX = useRef(new Animated.Value(0)).current;

  // A plain PanResponder and a nested Touchable both try to claim the same
  // gesture, and on react-native-web a swipe can end up firing both the pan
  // release AND the Touchable's onPress — so tap-vs-swipe is decided here,
  // entirely within one responder, instead of nesting a Touchable at all.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dx) > TAP_MOVE_TOLERANCE && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_evt, gesture) => {
        if (gesture.dx < 0) translateX.setValue(gesture.dx);
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dx < ARCHIVE_THRESHOLD) {
          Animated.timing(translateX, { toValue: SWIPE_OUT_DISTANCE, duration: 200, useNativeDriver: true }).start(onArchive);
        } else if (Math.abs(gesture.dx) <= TAP_MOVE_TOLERANCE && Math.abs(gesture.dy) <= TAP_MOVE_TOLERANCE) {
          onPress();
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  return (
    <View style={styles.rowContainer}>
      <View style={styles.archiveBackdrop}>
        <Text style={styles.archiveBackdropText}>Archive</Text>
      </View>
      <Animated.View
        testID="inbox-row"
        style={[styles.row, styles.noSelect, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.rowContent}>
          {item.listing.imageUrl ? (
            <Image source={{ uri: item.listing.imageUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]} />
          )}
          <View style={styles.info}>
            <View style={styles.headerRow}>
              <Text style={styles.name} numberOfLines={1}>{item.otherParticipant.displayName ?? 'User'}</Text>
              <Text style={styles.time}>{item.lastMessage ? timeAgo(item.lastMessage.createdAt) : timeAgo(item.updatedAt)}</Text>
            </View>
            <Text style={styles.listingTitle} numberOfLines={1}>{item.listing.title}</Text>
            <Text style={[styles.preview, item.unreadCount > 0 && styles.previewUnread]} numberOfLines={1}>
              {previewText(item)}
            </Text>
          </View>
          {item.unreadCount > 0 && (
            <View testID="unread-badge" style={styles.badge}>
              <Text style={styles.badgeText}>{item.unreadCount > 9 ? '9+' : item.unreadCount}</Text>
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

export default function InboxScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { refresh: refreshUnreadCount } = useUnreadCount();
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await conversationsApi.list();
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
      refreshUnreadCount();
    }, [load, refreshUnreadCount]),
  );

  const handleArchive = async (id: string) => {
    setItems(current => current.filter(item => item.id !== id));
    try {
      await conversationsApi.archive(id);
    } finally {
      refreshUnreadCount();
    }
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
          <Text style={styles.emptyText}>No conversations yet.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <InboxRow
          item={item}
          onPress={() => navigation.navigate('Chat', { listingId: item.listingId })}
          onArchive={() => handleArchive(item.id)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { ...textStyles.body, color: colors.muted },
  rowContainer: { backgroundColor: colors.red },
  // react-native-web supports userSelect but RN's own ViewStyle type doesn't
  // know about it — without this, dragging to swipe-archive on web instead
  // starts a text selection, which hijacks the gesture.
  noSelect: { userSelect: 'none' } as object,
  archiveBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.red,
  },
  archiveBackdropText: { ...textStyles.bodyMedium, color: colors.white },
  row: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowContent: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  avatar: { width: 52, height: 52, borderRadius: 8 },
  avatarPlaceholder: { backgroundColor: colors.border },
  info: { flex: 1, minWidth: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { ...textStyles.bodyMedium, color: colors.text, flexShrink: 1 },
  time: { ...textStyles.caption, color: colors.muted },
  listingTitle: { ...textStyles.caption, color: colors.muted, marginTop: 2 },
  preview: { ...textStyles.body, color: colors.muted, marginTop: 2 },
  previewUnread: { color: colors.text, fontWeight: '600' },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...textStyles.caption, color: colors.white, fontWeight: '700' },
});
