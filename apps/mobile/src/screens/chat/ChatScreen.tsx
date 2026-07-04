import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, typography } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export default function ChatScreen({ route }: Props) {
  const { conversationId } = route.params;
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Chat</Text>
      <Text style={styles.sub}>Conversation {conversationId} — messaging coming in SCRUM-45</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontSize: typography.fontSizes.xl, fontWeight: typography.fontWeights.bold, color: colors.text },
  sub: { fontSize: typography.fontSizes.md, color: colors.muted, textAlign: 'center', paddingHorizontal: 24 },
});
