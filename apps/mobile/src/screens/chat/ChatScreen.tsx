import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import {
  conversations as conversationsApi,
  profile as profileApi,
  uploadImageToCloudinary,
  Conversation,
  Message,
  ApiError,
} from '@/lib/api';
import { getSession } from '@/lib/session';
import { supabase, setRealtimeAuth } from '@/lib/supabase';
import { useUnreadCount } from '@/lib/unreadCount';
import { setActiveConversationId } from '@/lib/pushNotifications';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

interface DisplayMessage extends Message {
  pending?: boolean;
}

// Postgres Changes payloads use the DB's snake_case column names, not our
// API's camelCase response shape — this keeps both sources of messages
// (REST fetch and realtime events) in the same local shape.
function mapRealtimeRow(row: Record<string, unknown>): Message {
  return {
    id: row.id as string,
    senderId: row.sender_id as string,
    body: (row.body as string | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
    readAt: (row.read_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export default function ChatScreen({ route, navigation }: Props) {
  const { listingId } = route.params;
  const { refresh: refreshUnreadCount } = useUnreadCount();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [conv, myProfile] = await Promise.all([conversationsApi.start(listingId), profileApi.get()]);
        setConversation(conv);
        setMyUserId(myProfile.id);
        setMuted(conv.isMuted);
        navigation.setOptions({ title: conv.otherParticipant.displayName ?? 'Chat' });

        const existingMessages = await conversationsApi.messages(conv.id);
        setMessages(existingMessages);
        refreshUnreadCount();
        if (existingMessages.length === 0) {
          setComposerText(`Hi, is "${conv.listing.title}" still available?`);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not open this conversation');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  // Lets the push-notification handler (SCRUM-46) suppress the OS banner
  // for messages in whichever conversation the user already has open.
  useEffect(() => {
    if (!conversation) return undefined;
    setActiveConversationId(conversation.id);
    return () => setActiveConversationId(null);
  }, [conversation]);

  const handleToggleMute = useCallback(async () => {
    if (!conversation) return;
    const next = !muted;
    setMuted(next);
    try {
      await conversationsApi.mute(conversation.id, next);
    } catch {
      setMuted(!next);
    }
  }, [conversation, muted]);

  useEffect(() => {
    if (!conversation) return;
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity testID="mute-toggle-btn" onPress={handleToggleMute} style={styles.muteButton}>
          <Text style={styles.muteButtonText}>{muted ? '🔕' : '🔔'}</Text>
        </TouchableOpacity>
      ),
    });
  }, [conversation, muted, handleToggleMute, navigation]);

  // Subscribes once both the conversation and our own user id are known —
  // the INSERT handler needs myUserId to skip messages we sent ourselves
  // (those are already added optimistically and reconciled via the POST
  // response, so appending them again here would duplicate the bubble).
  useEffect(() => {
    if (!conversation || !myUserId) return undefined;

    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const session = await getSession();
      if (!active || !session) return;
      setRealtimeAuth(session.accessToken);

      channel = supabase
        .channel(`messages-${conversation.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` },
          payload => {
            const row = mapRealtimeRow(payload.new as Record<string, unknown>);
            if (row.senderId === myUserId) return;
            setMessages(current => (current.some(m => m.id === row.id) ? current : [...current, row]));
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` },
          payload => {
            const row = mapRealtimeRow(payload.new as Record<string, unknown>);
            setMessages(current => current.map(m => (m.id === row.id ? { ...m, readAt: row.readAt } : m)));
          },
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [conversation, myUserId]);

  const sendPayload = useCallback(
    async (payload: { body?: string; imageUrl?: string }, tempId: string) => {
      try {
        const real = await conversationsApi.sendMessage(conversation!.id, payload);
        setMessages(current => current.map(m => (m.id === tempId ? real : m)));
      } catch {
        setMessages(current => current.filter(m => m.id !== tempId));
        setError('Could not send your message. Please try again.');
        if (payload.body) setComposerText(payload.body);
      }
    },
    [conversation],
  );

  const handleSend = async () => {
    const body = composerText.trim();
    if (!body || !conversation || !myUserId) return;

    const tempId = `temp-${Date.now()}`;
    setMessages(current => [
      ...current,
      { id: tempId, senderId: myUserId, body, imageUrl: null, readAt: null, createdAt: new Date().toISOString(), pending: true },
    ]);
    setComposerText('');
    await sendPayload({ body }, tempId);
  };

  const handleAttachImage = async () => {
    if (!conversation || !myUserId || sending) return;

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
    if (result.canceled) return;

    setSending(true);
    const uri = result.assets[0].uri;
    const tempId = `temp-${Date.now()}`;
    setMessages(current => [
      ...current,
      { id: tempId, senderId: myUserId, body: null, imageUrl: uri, readAt: null, createdAt: new Date().toISOString(), pending: true },
    ]);

    try {
      const signature = await conversationsApi.getUploadSignature();
      const imageUrl = await uploadImageToCloudinary(uri, signature);
      await sendPayload({ imageUrl }, tempId);
    } catch {
      setMessages(current => current.filter(m => m.id !== tempId));
      setError('Could not send your image. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error && !conversation) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {conversation && (
        <View testID="listing-reference-card" style={styles.referenceCard}>
          {conversation.listing.imageUrl ? (
            <Image source={{ uri: conversation.listing.imageUrl }} style={styles.referenceImage} />
          ) : (
            <View style={[styles.referenceImage, styles.referenceImagePlaceholder]} />
          )}
          <View style={styles.referenceInfo}>
            <Text style={styles.referenceTitle} numberOfLines={1}>{conversation.listing.title}</Text>
            <Text style={styles.referencePrice}>${conversation.listing.price}</Text>
          </View>
        </View>
      )}

      <FlatList
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        data={messages}
        keyExtractor={item => item.id}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Say hello to get the conversation started.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMine = item.senderId === myUserId;
          return (
            <View testID="message-bubble" style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
              <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                {item.imageUrl && <Image source={{ uri: item.imageUrl }} style={styles.bubbleImage} />}
                {item.body && (
                  <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
                    {item.body}
                  </Text>
                )}
                {isMine && (
                  <Text testID="message-status" style={styles.statusText}>
                    {item.pending ? 'Sending...' : item.readAt ? 'Read' : 'Sent'}
                  </Text>
                )}
              </View>
            </View>
          );
        }}
      />

      {error && conversation && <Text style={styles.inlineError}>{error}</Text>}

      <View style={styles.composerRow}>
        <TouchableOpacity testID="attach-image-btn" style={styles.attachButton} onPress={handleAttachImage} disabled={sending}>
          <Text style={styles.attachButtonText}>+</Text>
        </TouchableOpacity>
        <TextInput
          testID="message-input"
          style={styles.composerInput}
          value={composerText}
          onChangeText={setComposerText}
          placeholder="Type a message..."
          placeholderTextColor={colors.muted}
          multiline
        />
        <TouchableOpacity
          testID="send-message-btn"
          style={[styles.sendButton, (!composerText.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!composerText.trim() || sending}
        >
          {sending ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.sendButtonText}>Send</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  errorText: { ...textStyles.body, color: colors.red, textAlign: 'center', paddingHorizontal: 24 },
  container: { flex: 1, backgroundColor: colors.bg },
  referenceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  referenceImage: { width: 48, height: 48, borderRadius: 8 },
  referenceImagePlaceholder: { backgroundColor: colors.border },
  referenceInfo: { flex: 1 },
  referenceTitle: { ...textStyles.bodyMedium, color: colors.text },
  referencePrice: { ...textStyles.caption, color: colors.primary, marginTop: 2 },
  messageList: { flex: 1 },
  messageListContent: { padding: 16, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { ...textStyles.body, color: colors.muted },
  bubbleRow: { flexDirection: 'row', marginBottom: 10 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 },
  bubbleMine: { backgroundColor: colors.primary },
  bubbleTheirs: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  bubbleImage: { width: 160, height: 160, borderRadius: 10, marginBottom: 6 },
  bubbleText: { ...textStyles.body },
  bubbleTextMine: { color: colors.white },
  bubbleTextTheirs: { color: colors.text },
  statusText: { ...textStyles.caption, color: 'rgba(255,255,255,0.75)', marginTop: 4, textAlign: 'right' },
  inlineError: { ...textStyles.caption, color: colors.red, textAlign: 'center', paddingBottom: 4 },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachButtonText: { fontSize: 22, color: colors.primary, lineHeight: 24 },
  composerInput: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...textStyles.body,
    color: colors.text,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { ...textStyles.bodyMedium, color: colors.white },
  muteButton: { paddingHorizontal: 12, paddingVertical: 6 },
  muteButtonText: { fontSize: 20 },
});
