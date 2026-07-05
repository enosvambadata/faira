import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Switch, ActivityIndicator, ScrollView } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { profile as profileApi, auth as authApi, ApiError } from '@/lib/api';

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [loading, setLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = await profileApi.get();
      setPushEnabled(current.pushNotificationsEnabled);
      setEmailEnabled(current.emailNotificationsEnabled);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleTogglePush = async (value: boolean) => {
    setPushEnabled(value);
    setPrefsError(null);
    try {
      await profileApi.updateNotifications({ pushEnabled: value });
    } catch {
      setPushEnabled(!value);
      setPrefsError('Could not save that. Please try again.');
    }
  };

  const handleToggleEmail = async (value: boolean) => {
    setEmailEnabled(value);
    setPrefsError(null);
    try {
      await profileApi.updateNotifications({ emailEnabled: value });
    } catch {
      setEmailEnabled(!value);
      setPrefsError('Could not save that. Please try again.');
    }
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSaved(false);
    setPasswordSaving(true);
    try {
      await profileApi.changePassword(newPassword);
      setNewPassword('');
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Could not update your password');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleLogout = async () => {
    await authApi.logout();
    navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Notifications</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Push notifications</Text>
        <Switch testID="push-notifications-switch" value={pushEnabled} onValueChange={handleTogglePush} />
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Email notifications</Text>
        <Switch testID="email-notifications-switch" value={emailEnabled} onValueChange={handleToggleEmail} />
      </View>
      {prefsError && <Text style={styles.error}>{prefsError}</Text>}

      <Text style={styles.sectionTitle}>Change Password</Text>
      <TextInput
        testID="new-password-input"
        style={styles.input}
        placeholder="New password"
        placeholderTextColor={colors.muted}
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
      />
      {passwordError && <Text style={styles.error}>{passwordError}</Text>}
      {passwordSaved && <Text style={styles.success}>Password updated.</Text>}
      <TouchableOpacity
        testID="change-password-btn"
        style={[styles.button, (newPassword.length < 8 || passwordSaving) && styles.buttonDisabled]}
        onPress={handleChangePassword}
        disabled={newPassword.length < 8 || passwordSaving}
      >
        {passwordSaving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Update Password</Text>}
      </TouchableOpacity>

      <TouchableOpacity testID="logout-btn" style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  sectionTitle: { ...textStyles.h3, color: colors.text, marginTop: 24, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  rowLabel: { ...textStyles.body, color: colors.text },
  error: { ...textStyles.caption, color: colors.red, marginTop: 4, marginBottom: 4 },
  success: { ...textStyles.caption, color: colors.green, marginTop: 4, marginBottom: 4 },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...textStyles.body,
    color: colors.text,
    marginBottom: 12,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { ...textStyles.bodyMedium, color: colors.white },
  logoutButton: {
    marginTop: 40,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.red,
    alignItems: 'center',
  },
  logoutButtonText: { ...textStyles.bodyMedium, color: colors.red },
});
