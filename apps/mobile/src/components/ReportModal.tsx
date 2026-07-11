import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, TextInput, Image, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, textStyles } from '@/theme';
import { reports as reportsApi, uploadImageToCloudinary, ReportReason, ApiError } from '@/lib/api';

const REASON_OPTIONS: { value: ReportReason; label: string }[] = [
  { value: 'FAKE_ITEM', label: 'Fake item' },
  { value: 'SCAM', label: 'Scam' },
  { value: 'INAPPROPRIATE', label: 'Inappropriate' },
  { value: 'OTHER', label: 'Other' },
];

interface Props {
  visible: boolean;
  targetType: 'LISTING' | 'USER';
  targetId: string;
  title: string;
  onClose: () => void;
}

export default function ReportModal({ visible, targetType, targetId, title, onClose }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setReason(null);
    setNote('');
    setPhotoUri(null);
    setError(null);
    setSubmitted(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handlePickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    setPhotoUri(result.assets[0].uri);
  };

  const handleSubmit = async () => {
    if (!reason) {
      setError('Pick a reason first');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let evidenceImageUrls: string[] | undefined;
      if (photoUri) {
        setUploadingPhoto(true);
        const signature = await reportsApi.getUploadSignature();
        const url = await uploadImageToCloudinary(photoUri, signature);
        evidenceImageUrls = [url];
        setUploadingPhoto(false);
      }
      await reportsApi.create({ targetType, targetId, reason, note: note.trim() || undefined, evidenceImageUrls });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit this report right now');
    } finally {
      setSubmitting(false);
      setUploadingPhoto(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {submitted ? (
            <>
              <Text style={styles.title}>Report submitted</Text>
              <Text style={styles.body}>Thanks for letting us know. Our team will review this report.</Text>
              <TouchableOpacity testID="report-done-btn" style={styles.primaryButton} onPress={handleClose}>
                <Text style={styles.primaryButtonText}>Done</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>{title}</Text>

              <View style={styles.reasonRow}>
                {REASON_OPTIONS.map(option => (
                  <TouchableOpacity
                    key={option.value}
                    testID={`report-reason-${option.value}`}
                    style={[styles.reasonChip, reason === option.value && styles.reasonChipActive]}
                    onPress={() => setReason(option.value)}
                  >
                    <Text style={[styles.reasonChipText, reason === option.value && styles.reasonChipTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.input}
                placeholder="Add a note (optional)"
                placeholderTextColor={colors.muted}
                value={note}
                onChangeText={setNote}
                multiline
              />

              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photoPreview} />
              ) : (
                <TouchableOpacity testID="report-add-photo-btn" style={styles.photoButton} onPress={handlePickPhoto}>
                  <Text style={styles.photoButtonText}>Add a photo (optional)</Text>
                </TouchableOpacity>
              )}

              {error && <Text style={styles.error}>{error}</Text>}

              <View style={styles.actions}>
                <TouchableOpacity onPress={handleClose} disabled={submitting}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="report-submit-btn"
                  style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.primaryButtonText}>{uploadingPhoto ? 'Uploading photo…' : 'Submit report'}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 20, gap: 12 },
  title: { ...textStyles.h2, color: colors.text, fontSize: 20 },
  body: { ...textStyles.body, color: colors.text },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  reasonChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  reasonChipText: { ...textStyles.body, color: colors.muted },
  reasonChipTextActive: { color: colors.primary },
  input: {
    ...textStyles.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  photoButton: { alignSelf: 'flex-start' },
  photoButtonText: { ...textStyles.body, color: colors.primary, textDecorationLine: 'underline' },
  photoPreview: { width: 80, height: 80, borderRadius: 10 },
  error: { ...textStyles.body, color: colors.red },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 20, marginTop: 4 },
  cancelText: { ...textStyles.bodyMedium, color: colors.muted },
  primaryButton: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center' },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: { ...textStyles.bodyMedium, color: colors.white },
});
