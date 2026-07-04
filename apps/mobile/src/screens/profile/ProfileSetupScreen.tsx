import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import ProfileForm from './ProfileForm';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ProfileSetup'>;

export default function ProfileSetupScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set up your profile</Text>
      <Text style={styles.subtitle}>Buyers and sellers will see this on your listings and chats.</Text>
      <ProfileForm
        submitLabel="Continue"
        onSaved={() => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 32 },
  title: { ...textStyles.h2, color: colors.text, textAlign: 'center' },
  subtitle: {
    ...textStyles.body,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 24,
  },
});
