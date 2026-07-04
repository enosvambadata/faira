import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { listings as listingsApi, ListingDetail, ApiError } from '@/lib/api';

type Props = NativeStackScreenProps<RootStackParamList, 'EditListing'>;

const MAX_PHOTOS = 6;

type PhotoItem = { key: string; kind: 'existing'; url: string } | { key: string; kind: 'new'; uri: string };

export default function EditListingScreen({ route, navigation }: Props) {
  const { listingId } = route.params;

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const uploadedUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await listingsApi.get(listingId);
        setListing(data);
        setPrice(data.price);
        setDescription(data.description ?? '');
        setPhotos(data.imageUrls.map(url => ({ key: url, kind: 'existing', url })));
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : 'Could not load this listing');
      } finally {
        setLoading(false);
      }
    })();
  }, [listingId]);

  const handleAddPhoto = async () => {
    if (photos.length >= MAX_PHOTOS) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
    });

    if (result.canceled) return;

    setPhotos(current => [
      ...current,
      ...result.assets.map(a => ({ key: a.uri, kind: 'new' as const, uri: a.uri })),
    ].slice(0, MAX_PHOTOS));
  };

  const handleRemovePhoto = (key: string) => {
    setPhotos(current => current.filter(p => p.key !== key));
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    const priceNum = Number(price);
    if (!price || Number.isNaN(priceNum) || priceNum <= 0) nextErrors.price = 'Enter a valid price';
    if (photos.length === 0) nextErrors.photos = 'Keep at least 1 photo';

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const imageUrls: string[] = [];
      for (const photo of photos) {
        if (photo.kind === 'existing') {
          imageUrls.push(photo.url);
          continue;
        }
        const cached = uploadedUrlsRef.current[photo.uri];
        if (cached) {
          imageUrls.push(cached);
          continue;
        }
        const signature = await listingsApi.getUploadSignature();
        const url = await listingsApi.uploadImage(photo.uri, signature);
        uploadedUrlsRef.current[photo.uri] = url;
        imageUrls.push(url);
      }

      await listingsApi.update(listingId, {
        price: Number(price),
        description: description.trim() || undefined,
        imageUrls,
      });

      navigation.goBack();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not save changes');
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

  if (loadError || !listing) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{loadError ?? 'Listing not found'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{listing.title}</Text>
      <Text style={styles.subtitle}>{listing.city}</Text>

      <Text style={styles.label}>Photos ({photos.length}/{MAX_PHOTOS})</Text>
      <View style={styles.photoRow}>
        {photos.map(photo => (
          <View key={photo.key} style={styles.photoThumbWrap}>
            <Image source={{ uri: photo.kind === 'existing' ? photo.url : photo.uri }} style={styles.photoThumb} />
            <TouchableOpacity style={styles.removePhoto} onPress={() => handleRemovePhoto(photo.key)}>
              <Text style={styles.removePhotoText}>×</Text>
            </TouchableOpacity>
          </View>
        ))}
        {photos.length < MAX_PHOTOS && (
          <TouchableOpacity testID="add-photo" style={styles.addPhoto} onPress={handleAddPhoto}>
            <Text style={styles.addPhotoText}>+</Text>
          </TouchableOpacity>
        )}
      </View>
      {errors.photos && <Text style={styles.error}>{errors.photos}</Text>}

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Condition details, sizing notes, etc."
        placeholderTextColor={colors.muted}
        multiline
      />

      <Text style={styles.label}>Price (USD)</Text>
      <TextInput
        style={styles.input}
        value={price}
        onChangeText={setPrice}
        placeholder="e.g. 15.00"
        placeholderTextColor={colors.muted}
        keyboardType="decimal-pad"
      />
      {errors.price && <Text style={styles.error}>{errors.price}</Text>}

      {submitError && <Text style={styles.submitError}>{submitError}</Text>}

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitButtonText}>Save Changes</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  title: { ...textStyles.h2, color: colors.text },
  subtitle: { ...textStyles.caption, color: colors.muted, marginTop: 2 },
  label: { ...textStyles.bodyMedium, color: colors.text, marginTop: 20, marginBottom: 8 },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...textStyles.body,
    color: colors.text,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  error: { ...textStyles.caption, color: colors.red, marginTop: 6 },
  submitError: { ...textStyles.body, color: colors.red, marginTop: 20, textAlign: 'center' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoThumbWrap: { position: 'relative' },
  photoThumb: { width: 72, height: 72, borderRadius: 10 },
  removePhoto: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: { color: colors.white, fontSize: 14, lineHeight: 16 },
  addPhoto: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  addPhotoText: { fontSize: 28, color: colors.primary },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonText: { ...textStyles.bodyMedium, color: colors.white, fontSize: 17 },
});
