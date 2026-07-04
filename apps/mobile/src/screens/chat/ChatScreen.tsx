import React, { useEffect, useState } from 'react';
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
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { conversations as conversationsApi, profile as profileApi, Conversation, Message, ApiError } from '@/lib/api';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export default function ChatScreen({ route, navigation }: Props) {
  const { listingId } = route.params;

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [conv, myProfile] = await Promise.all([conversationsApi.start(listingId), profileApi.get()]);
        setConversation(conv);
        setMyUserId(myProfile.id);
        navigation.setOptions({ title: conv.otherParticipant.displayName ?? 'Chat' });

        const existingMessages = await conversationsApi.messages(conv.id);
        setMessages(existingMessages);
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

  const handleSend = async () => {
    const body = composerText.trim();
    if (!body || !conversation || sending) return;

    setSending(true);
    try {
      const message = await conversationsApi.sendMessage(conversation.id, { body });
      setMessages(current => [...current, message]);
      setComposerText('');
    } catch {
      setError('Could not send your message. Please try again.');
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
              </View>
            </View>
          );
        }}
      />

      {error && conversation && <Text style={styles.inlineError}>{error}</Text>}

      <View style={styles.composerRow}>
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
});
