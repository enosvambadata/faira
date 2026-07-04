import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { categories as categoriesApi, listings as listingsApi, Category, ListingFilters, EMPTY_LISTING_FILTERS } from '@/lib/api';

type Props = NativeStackScreenProps<RootStackParamList, 'Filters'>;

const CONDITIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'LIKE_NEW', label: 'Like New' },
  { value: 'GOOD', label: 'Good' },
  { value: 'FAIR', label: 'Fair' },
];

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

export default function FilterScreen({ route, navigation }: Props) {
  const { current, onApply } = route.params;

  const [categories, setCategories] = useState<Category[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [categoryIds, setCategoryIds] = useState(current.categoryIds);
  const [conditions, setConditions] = useState(current.conditions);
  const [selectedCities, setSelectedCities] = useState(current.cities);
  const [selectedSizes, setSelectedSizes] = useState(current.sizes);
  const [minPrice, setMinPrice] = useState(current.minPrice !== undefined ? String(current.minPrice) : '');
  const [maxPrice, setMaxPrice] = useState(current.maxPrice !== undefined ? String(current.maxPrice) : '');

  const [resultCount, setResultCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const [cats, options] = await Promise.all([
        categoriesApi.list().catch(() => []),
        listingsApi.filterOptions().catch(() => ({ cities: [], sizes: [] })),
      ]);
      setCategories(cats);
      setCities(options.cities);
      setSizes(options.sizes);
      setLoadingOptions(false);
    })();
  }, []);

  const draft: ListingFilters = {
    categoryIds,
    conditions,
    cities: selectedCities,
    sizes: selectedSizes,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setCountLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await listingsApi.browse(1, draft);
        setResultCount(result.total);
      } catch {
        setResultCount(null);
      } finally {
        setCountLoading(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryIds, conditions, selectedCities, selectedSizes, minPrice, maxPrice]);

  const handleClearAll = () => {
    setCategoryIds(EMPTY_LISTING_FILTERS.categoryIds);
    setConditions(EMPTY_LISTING_FILTERS.conditions);
    setSelectedCities(EMPTY_LISTING_FILTERS.cities);
    setSelectedSizes(EMPTY_LISTING_FILTERS.sizes);
    setMinPrice('');
    setMaxPrice('');
  };

  const handleApply = () => {
    onApply(draft);
    navigation.goBack();
  };

  if (loadingOptions) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Category</Text>
        <View style={styles.chipRow}>
          {categories.map(cat => (
            <TouchableOpacity
              key={cat.id}
              testID="filter-category-chip"
              style={[styles.chip, categoryIds.includes(cat.id) && styles.chipSelected]}
              onPress={() => setCategoryIds(current => toggle(current, cat.id))}
            >
              <Text style={[styles.chipText, categoryIds.includes(cat.id) && styles.chipTextSelected]}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Condition</Text>
        <View style={styles.chipRow}>
          {CONDITIONS.map(c => (
            <TouchableOpacity
              key={c.value}
              testID="filter-condition-chip"
              style={[styles.chip, conditions.includes(c.value) && styles.chipSelected]}
              onPress={() => setConditions(current => toggle(current, c.value))}
            >
              <Text style={[styles.chipText, conditions.includes(c.value) && styles.chipTextSelected]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {sizes.length > 0 && (
          <>
            <Text style={styles.label}>Size</Text>
            <View style={styles.chipRow}>
              {sizes.map(size => (
                <TouchableOpacity
                  key={size}
                  testID="filter-size-chip"
                  style={[styles.chip, selectedSizes.includes(size) && styles.chipSelected]}
                  onPress={() => setSelectedSizes(current => toggle(current, size))}
                >
                  <Text style={[styles.chipText, selectedSizes.includes(size) && styles.chipTextSelected]}>{size}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text style={styles.label}>Price range (USD)</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.half]}
            value={minPrice}
            onChangeText={setMinPrice}
            placeholder="Min"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[styles.input, styles.half]}
            value={maxPrice}
            onChangeText={setMaxPrice}
            placeholder="Max"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
          />
        </View>

        {cities.length > 0 && (
          <>
            <Text style={styles.label}>City</Text>
            <View style={styles.chipRow}>
              {cities.map(city => (
                <TouchableOpacity
                  key={city}
                  testID="filter-city-chip"
                  style={[styles.chip, selectedCities.includes(city) && styles.chipSelected]}
                  onPress={() => setSelectedCities(current => toggle(current, city))}
                >
                  <Text style={[styles.chipText, selectedCities.includes(city) && styles.chipTextSelected]}>{city}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <TouchableOpacity onPress={handleClearAll} style={styles.clearAll}>
          <Text style={styles.clearAllText}>Clear all filters</Text>
        </TouchableOpacity>
      </ScrollView>

      <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
        {countLoading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text testID="filter-result-count" style={styles.applyButtonText}>
            Show {resultCount ?? 0} {resultCount === 1 ? 'result' : 'results'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 100 },
  label: { ...textStyles.bodyMedium, color: colors.text, marginTop: 20, marginBottom: 8 },
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
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
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
  clearAll: { marginTop: 28, alignItems: 'center' },
  clearAllText: { ...textStyles.body, color: colors.primary },
  applyButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    margin: 20,
  },
  applyButtonText: { ...textStyles.bodyMedium, color: colors.white, fontSize: 17 },
});
