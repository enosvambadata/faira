import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Switch, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { profile as profileApi, auth as authApi, account as accountApi, DeletionRequestData, ApiError } from '@/lib/api';

function deletionDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

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

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [deletionRequest, setDeletionRequest] = useState<DeletionRequestData | null>(null);
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [current, latestDeletion] = await Promise.all([profileApi.get(), accountApi.getDeletionRequest()]);
      setPushEnabled(current.pushNotificationsEnabled);
      setEmailEnabled(current.emailNotificationsEnabled);
      setDeletionRequest(latestDeletion);
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

  const handleExportData = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const data = await accountApi.exportData();
      const json = JSON.stringify(data, null, 2);
      const filename = `faira-data-export-${Date.now()}.json`;

      if (Platform.OS === 'web') {
        // No native share sheet on web — trigger a standard browser download instead.
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        const fileUri = `${FileSystem.documentDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, json);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        }
      }
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'Could not export your data. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleRequestDeletion = async () => {
    setDeletionError(null);
    setDeletionBusy(true);
    try {
      const created = await accountApi.requestDeletion();
      setDeletionRequest(created);
      setConfirmingDeletion(false);
    } catch (err) {
      setDeletionError(err instanceof ApiError ? err.message : 'Could not submit your deletion request.');
    } finally {
      setDeletionBusy(false);
    }
  };

  const handleCancelDeletion = async () => {
    setDeletionError(null);
    setDeletionBusy(true);
    try {
      await accountApi.cancelDeletion();
      setDeletionRequest(current => (current ? { ...current, status: 'CANCELLED' } : current));
    } catch (err) {
      setDeletionError(err instanceof ApiError ? err.message : 'Could not cancel your deletion request.');
    } finally {
      setDeletionBusy(false);
    }
  };

  const hasPendingDeletion = deletionRequest?.status === 'PENDING';

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

      <Text style={styles.sectionTitle}>Your Data</Text>
      <TouchableOpacity testID="export-data-btn" style={styles.secondaryButton} onPress={handleExportData} disabled={exporting}>
        {exporting ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.secondaryButtonText}>Export My Data</Text>}
      </TouchableOpacity>
      {exportError && <Text style={styles.error}>{exportError}</Text>}

      <Text style={styles.sectionTitle}>Danger Zone</Text>
      {hasPendingDeletion && deletionRequest ? (
        <View testID="deletion-pending-card" style={styles.dangerCard}>
          <Text style={styles.rowLabel}>
            Your account is scheduled for deletion on {deletionDateLabel(deletionRequest.scheduledFor)}.
          </Text>
          {deletionError && <Text style={styles.error}>{deletionError}</Text>}
          <TouchableOpacity
            testID="cancel-deletion-btn"
            style={[styles.secondaryButton, { marginTop: 12 }]}
            onPress={handleCancelDeletion}
            disabled={deletionBusy}
          >
            {deletionBusy ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.secondaryButtonText}>Cancel Deletion Request</Text>}
          </TouchableOpacity>
        </View>
      ) : confirmingDeletion ? (
        <View testID="deletion-confirm-card" style={styles.dangerCard}>
          <Text style={styles.rowLabel}>
            Your account will be scheduled for deletion. Your data will be anonymised in 30 days. You can cancel any time before then.
          </Text>
          {deletionError && <Text style={styles.error}>{deletionError}</Text>}
          <View style={styles.confirmRow}>
            <TouchableOpacity
              testID="confirm-delete-account-btn"
              style={styles.dangerButton}
              onPress={handleRequestDeletion}
              disabled={deletionBusy}
            >
              {deletionBusy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.dangerButtonText}>Yes, Delete My Account</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              testID="cancel-confirm-delete-btn"
              style={styles.secondaryButton}
              onPress={() => setConfirmingDeletion(false)}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity testID="delete-account-btn" style={styles.dangerOutlineButton} onPress={() => setConfirmingDeletion(true)}>
          <Text style={styles.dangerOutlineButtonText}>Delete My Account</Text>
        </TouchableOpacity>
      )}
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
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  secondaryButtonText: { ...textStyles.bodyMedium, color: colors.primary },
  dangerCard: { backgroundColor: colors.white, borderRadius: 12, padding: 16 },
  dangerOutlineButton: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.red,
    alignItems: 'center',
  },
  dangerOutlineButtonText: { ...textStyles.bodyMedium, color: colors.red },
  confirmRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  dangerButton: {
    flex: 1,
    backgroundColor: colors.red,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerButtonText: { ...textStyles.bodyMedium, color: colors.white },
});
