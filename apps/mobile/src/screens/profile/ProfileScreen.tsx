import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, textStyles } from '@/theme';
import ProfileForm from './ProfileForm';

export default function ProfileScreen() {
  const [savedAt, setSavedAt] = useState<number | null>(null);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      {savedAt !== null && <Text style={styles.savedBanner}>Saved</Text>}
      <ProfileForm submitLabel="Save Changes" onSaved={() => setSavedAt(Date.now())} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 16 },
  title: { ...textStyles.h2, color: colors.text, textAlign: 'center' },
  savedBanner: { ...textStyles.caption, color: colors.green, textAlign: 'center', marginTop: 4 },
});
