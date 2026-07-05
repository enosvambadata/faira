import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { colors, textStyles } from '@/theme';
import { verification as verificationApi, uploadImageToCloudinary, VerificationRequestData, ApiError } from '@/lib/api';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Your documents are under review.',
  APPROVED: "You're verified!",
  REJECTED: 'Your last submission was rejected.',
};

export default function SellerVerificationScreen() {
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<VerificationRequestData | null>(null);
  const [idDocUri, setIdDocUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await verificationApi.mine();
      setCurrent(data);
    } catch {
      setCurrent(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const pickImage = async (setUri: (uri: string) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
    if (!result.canceled) setUri(result.assets[0].uri);
  };

  const handleSubmit = async () => {
    if (!idDocUri || !selfieUri || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const idSignature = await verificationApi.getUploadSignature();
      const idDocumentUrl = await uploadImageToCloudinary(idDocUri, idSignature);
      const selfieSignature = await verificationApi.getUploadSignature();
      const selfieUrl = await uploadImageToCloudinary(selfieUri, selfieSignature);

      const submitted = await verificationApi.submit({ idDocumentUrl, selfieUrl });
      setCurrent(submitted);
      setIdDocUri(null);
      setSelfieUri(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your documents. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const showForm = !current || current.status === 'REJECTED';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {current && (
        <View testID="verification-status-card" style={styles.statusCard}>
          <Text style={styles.statusText}>{STATUS_LABELS[current.status]}</Text>
          {current.status === 'REJECTED' && current.rejectionReason && (
            <Text style={styles.rejectionReason}>Reason: {current.rejectionReason}</Text>
          )}
        </View>
      )}

      {showForm && (
        <>
          <Text style={styles.instructions}>
            Upload a photo of your government-issued ID and a selfie so we can verify your identity as a seller.
          </Text>

          <Text style={styles.label}>ID Document</Text>
          <TouchableOpacity testID="pick-id-doc-btn" style={styles.pickButton} onPress={() => pickImage(setIdDocUri)}>
            {idDocUri ? (
              <Image source={{ uri: idDocUri }} style={styles.preview} />
            ) : (
              <Text style={styles.pickButtonText}>Choose photo</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.label}>Selfie</Text>
          <TouchableOpacity testID="pick-selfie-btn" style={styles.pickButton} onPress={() => pickImage(setSelfieUri)}>
            {selfieUri ? (
              <Image source={{ uri: selfieUri }} style={styles.preview} />
            ) : (
              <Text style={styles.pickButtonText}>Choose photo</Text>
            )}
          </TouchableOpacity>

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            testID="submit-verification-btn"
            style={[styles.submitButton, (!idDocUri || !selfieUri || submitting) && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!idDocUri || !selfieUri || submitting}
          >
            {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitButtonText}>Submit for Review</Text>}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  statusCard: { backgroundColor: colors.white, borderRadius: 12, padding: 16, marginBottom: 20 },
  statusText: { ...textStyles.bodyMedium, color: colors.text },
  rejectionReason: { ...textStyles.body, color: colors.red, marginTop: 8 },
  instructions: { ...textStyles.body, color: colors.muted, marginBottom: 20 },
  label: { ...textStyles.bodyMedium, color: colors.text, marginBottom: 8 },
  pickButton: {
    height: 160,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    overflow: 'hidden',
  },
  pickButtonText: { ...textStyles.body, color: colors.primary },
  preview: { width: '100%', height: '100%' },
  error: { ...textStyles.caption, color: colors.red, marginBottom: 12 },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { ...textStyles.bodyMedium, color: colors.white },
});
