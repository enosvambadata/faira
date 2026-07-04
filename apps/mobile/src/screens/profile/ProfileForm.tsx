import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, textStyles } from '@/theme';
import { profile as profileApi, ApiError, Profile } from '@/lib/api';
import { getOnboardingCity } from '@/lib/onboarding';

interface Props {
  submitLabel: string;
  onSaved: (profile: Profile) => void;
}

export default function ProfileForm({ submitLabel, onSaved }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [city, setCity] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const current = await profileApi.get();
        setDisplayName(current.displayName ?? '');
        setAvatarUrl(current.avatarUrl);
        setCity(current.city ?? (await getOnboardingCity()));
      } catch {
        setCity(await getOnboardingCity());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library access is needed to set an avatar');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    setUploadingAvatar(true);
    setError(null);
    try {
      const updated = await profileApi.uploadAvatar(
        asset.uri,
        asset.mimeType ?? 'image/jpeg',
        asset.fileName ?? 'avatar.jpg',
      );
      setAvatarUrl(updated.avatarUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload the image');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const updated = await profileApi.update({ displayName: displayName.trim(), city });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile');
    } finally {
      setSaving(false);
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
    <View style={styles.container}>
      <TouchableOpacity style={styles.avatarWrap} onPress={handlePickAvatar} disabled={uploadingAvatar}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarPlaceholderText}>+</Text>
          </View>
        )}
        {uploadingAvatar && (
          <View style={styles.avatarOverlay}>
            <ActivityIndicator color={colors.white} />
          </View>
        )}
      </TouchableOpacity>
      <Text style={styles.avatarHint}>Tap to {avatarUrl ? 'change' : 'add'} a photo (optional)</Text>

      <Text style={styles.label}>Display name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Tendai M."
        placeholderTextColor={colors.muted}
        value={displayName}
        onChangeText={setDisplayName}
      />

      <Text style={styles.label}>City</Text>
      <TextInput style={styles.input} value={city} onChangeText={setCity} />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={styles.button}
        onPress={handleSave}
        disabled={saving || displayName.trim().length === 0}
      >
        {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>{submitLabel}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, padding: 24, alignItems: 'center' },
  avatarWrap: { marginTop: 16 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarPlaceholder: {
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: { fontSize: 32, color: colors.primary },
  avatarOverlay: {
    ...({ position: 'absolute' } as const),
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 48,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarHint: { ...textStyles.caption, color: colors.muted, marginTop: 8, marginBottom: 24 },
  label: { ...textStyles.bodyMedium, color: colors.text, alignSelf: 'flex-start', marginBottom: 6 },
  input: {
    width: '100%',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...textStyles.body,
    color: colors.text,
    marginBottom: 16,
  },
  error: { ...textStyles.caption, color: colors.red, marginBottom: 8 },
  button: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { ...textStyles.bodyMedium, color: colors.white, fontSize: 17 },
});
