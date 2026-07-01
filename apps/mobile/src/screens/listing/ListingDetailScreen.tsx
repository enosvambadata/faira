import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, typography } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ListingDetail'>;

export default function ListingDetailScreen({ route }: Props) {
  const { listingId } = route.params;
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Listing Detail</Text>
      <Text style={styles.sub}>ID: {listingId} — full screen coming in SCRUM-34</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontSize: typography.fontSizes.xl, fontWeight: typography.fontWeights.bold, color: colors.text },
  sub: { fontSize: typography.fontSizes.md, color: colors.muted, textAlign: 'center', paddingHorizontal: 24 },
});
