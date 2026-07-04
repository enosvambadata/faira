import React, { useEffect, useRef, useState, useCallback } from 'react';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { ZIMBABWE_CITIES } from '@/data/cities';
import { DELIVERY_OPTIONS } from '@/data/deliveryOptions';
import { categories as categoriesApi, listings as listingsApi, Category, ApiError } from '@/lib/api';
import { getListingDraft, saveListingDraft, clearListingDraft, ListingDraft } from '@/lib/listingDraft';
import { getOnboardingCity } from '@/lib/onboarding';

const CONDITIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'LIKE_NEW', label: 'Like New' },
  { value: 'GOOD', label: 'Good' },
  { value: 'FAIR', label: 'Fair' },
];

const MAX_PHOTOS = 6;

export default function SellScreen() {
  // SellScreen lives inside the Tab navigator, so the default navigation
  // prop here is the Tab navigator's — go through the parent to reach the
  // root stack, same as the onboarding/auth screens do.
  const tabNavigation = useNavigation();

  const [categories, setCategories] = useState<Category[]>([]);
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState('');
  const [city, setCity] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [size, setSize] = useState('');
  const [brand, setBrand] = useState('');
  const [deliveryOptions, setDeliveryOptions] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Ref mirror of state so the focus-loss cleanup (which closes over stale
  // state otherwise) always saves the latest values.
  // Caches successful uploads across retries so re-submitting after a
  // failure doesn't re-upload photos that already made it to Cloudinary.
  const uploadedUrlsRef = useRef<Record<string, string>>({});

  const draftRef = useRef<ListingDraft>({
    title: '',
    description: '',
    price: '',
    condition: '',
    city: '',
    categoryId: '',
    size: '',
    brand: '',
    deliveryOptions: [],
    photoUris: [],
  });
  useEffect(() => {
    draftRef.current = { title, description, price, condition, city, categoryId, size, brand, deliveryOptions, photoUris };
  }, [title, description, price, condition, city, categoryId, size, brand, deliveryOptions, photoUris]);

  useEffect(() => {
    (async () => {
      const [cats, draft, onboardingCity] = await Promise.all([
        categoriesApi.list().catch(() => []),
        getListingDraft(),
        getOnboardingCity(),
      ]);
      setCategories(cats);
      if (draft) {
        setTitle(draft.title);
        setDescription(draft.description);
        setPrice(draft.price);
        setCondition(draft.condition);
        setCity(draft.city || onboardingCity);
        setCategoryId(draft.categoryId);
        setSize(draft.size);
        setBrand(draft.brand);
        setDeliveryOptions(draft.deliveryOptions);
        setPhotoUris(draft.photoUris);
      } else {
        setCity(onboardingCity);
      }
      setLoaded(true);
    })();
  }, []);

  // Save the draft when this screen loses focus (user navigates away or
  // backgrounds the app) — covers "draft saved if user exits mid-form".
  useFocusEffect(
    useCallback(() => {
      return () => {
        saveListingDraft(draftRef.current);
      };
    }, []),
  );

  const handleAddPhoto = async () => {
    if (photoUris.length >= MAX_PHOTOS) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photoUris.length,
    });

    if (result.canceled) return;

    setPhotoUris(current => [...current, ...result.assets.map(a => a.uri)].slice(0, MAX_PHOTOS));
  };

  const handleRemovePhoto = (uri: string) => {
    setPhotoUris(current => current.filter(u => u !== uri));
  };

  const toggleDeliveryOption = (option: string) => {
    setDeliveryOptions(current =>
      current.includes(option) ? current.filter(o => o !== option) : [...current, option],
    );
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    if (!title.trim()) nextErrors.title = 'Title is required';
    if (photoUris.length === 0) nextErrors.photos = 'Add at least 1 photo';
    if (!categoryId) nextErrors.category = 'Choose a category';
    if (!condition) nextErrors.condition = 'Choose a condition';
    const priceNum = Number(price);
    if (!price || Number.isNaN(priceNum) || priceNum <= 0) nextErrors.price = 'Enter a valid price';
    if (!city) nextErrors.city = 'Choose a city';
    if (deliveryOptions.length === 0) nextErrors.deliveryOptions = 'Choose at least 1 delivery option';

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const imageUrls: string[] = [];
      for (const uri of photoUris) {
        const cached = uploadedUrlsRef.current[uri];
        if (cached) {
          imageUrls.push(cached);
          continue;
        }
        const signature = await listingsApi.getUploadSignature();
        const url = await listingsApi.uploadImage(uri, signature);
        uploadedUrlsRef.current[uri] = url;
        imageUrls.push(url);
      }

      const attributes: Record<string, string> = {};
      if (size.trim()) attributes.size = size.trim();
      if (brand.trim()) attributes.brand = brand.trim();

      await listingsApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        price: Number(price),
        condition: condition as 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR',
        city,
        categoryId,
        imageUrls,
        deliveryOptions,
        attributes,
      });

      await clearListingDraft();
      tabNavigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.reset({
        index: 0,
        routes: [{ name: 'Tabs' }],
      });
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not upload photos or create the listing');
    } finally {
      setSubmitting(false);
    }
  };

  if (!loaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Sell an Item</Text>

      <Text style={styles.label}>Photos ({photoUris.length}/{MAX_PHOTOS})</Text>
      <View style={styles.photoRow}>
        {photoUris.map(uri => (
          <View key={uri} style={styles.photoThumbWrap}>
            <Image source={{ uri }} style={styles.photoThumb} />
            <TouchableOpacity style={styles.removePhoto} onPress={() => handleRemovePhoto(uri)}>
              <Text style={styles.removePhotoText}>×</Text>
            </TouchableOpacity>
          </View>
        ))}
        {photoUris.length < MAX_PHOTOS && (
          <TouchableOpacity testID="add-photo" style={styles.addPhoto} onPress={handleAddPhoto}>
            <Text style={styles.addPhotoText}>+</Text>
          </TouchableOpacity>
        )}
      </View>
      {errors.photos && <Text style={styles.error}>{errors.photos}</Text>}

      <Text style={styles.label}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.chip, categoryId === cat.id && styles.chipSelected]}
            onPress={() => setCategoryId(cat.id)}
          >
            <Text style={[styles.chipText, categoryId === cat.id && styles.chipTextSelected]}>{cat.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {errors.category && <Text style={styles.error}>{errors.category}</Text>}

      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Nike Air Max, size 9" placeholderTextColor={colors.muted} />
      {errors.title && <Text style={styles.error}>{errors.title}</Text>}

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Condition details, sizing notes, etc."
        placeholderTextColor={colors.muted}
        multiline
      />

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Size</Text>
          <TextInput style={styles.input} value={size} onChangeText={setSize} placeholder="e.g. M, 9, 32" placeholderTextColor={colors.muted} />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Brand</Text>
          <TextInput style={styles.input} value={brand} onChangeText={setBrand} placeholder="e.g. Nike" placeholderTextColor={colors.muted} />
        </View>
      </View>

      <Text style={styles.label}>Condition</Text>
      <View style={styles.chipRow}>
        {CONDITIONS.map(c => (
          <TouchableOpacity
            key={c.value}
            style={[styles.chip, condition === c.value && styles.chipSelected]}
            onPress={() => setCondition(c.value)}
          >
            <Text style={[styles.chipText, condition === c.value && styles.chipTextSelected]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {errors.condition && <Text style={styles.error}>{errors.condition}</Text>}

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

      <Text style={styles.label}>City</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {ZIMBABWE_CITIES.map(c => (
          <TouchableOpacity key={c} style={[styles.chip, city === c && styles.chipSelected]} onPress={() => setCity(c)}>
            <Text style={[styles.chipText, city === c && styles.chipTextSelected]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {errors.city && <Text style={styles.error}>{errors.city}</Text>}

      <Text style={styles.label}>Delivery options</Text>
      <View style={styles.chipRow}>
        {DELIVERY_OPTIONS.map(option => {
          const selected = deliveryOptions.includes(option);
          return (
            <TouchableOpacity
              key={option}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => toggleDeliveryOption(option)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {errors.deliveryOptions && <Text style={styles.error}>{errors.deliveryOptions}</Text>}

      {submitError && <Text style={styles.submitError}>{submitError}</Text>}

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitButtonText}>List Item</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  title: { ...textStyles.h2, color: colors.text, marginBottom: 16 },
  label: { ...textStyles.bodyMedium, color: colors.text, marginTop: 16, marginBottom: 8 },
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
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { ...textStyles.body, color: colors.text },
  chipTextSelected: { color: colors.primary },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonText: { ...textStyles.bodyMedium, color: colors.white, fontSize: 17 },
});
