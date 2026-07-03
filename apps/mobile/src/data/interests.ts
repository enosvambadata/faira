export interface Interest {
  id: string;
  label: string;
  emoji: string;
}

export const INTERESTS: Interest[] = [
  { id: 'fashion', label: 'Fashion & Clothing', emoji: '👗' },
  { id: 'electronics', label: 'Electronics', emoji: '📱' },
  { id: 'home', label: 'Home & Furniture', emoji: '🛋️' },
  { id: 'beauty', label: 'Beauty & Health', emoji: '💄' },
  { id: 'kids', label: 'Kids & Baby', emoji: '🧸' },
  { id: 'sports', label: 'Sports & Outdoors', emoji: '⚽' },
  { id: 'vehicles', label: 'Vehicles & Parts', emoji: '🚗' },
  { id: 'books', label: 'Books & Media', emoji: '📚' },
];

export const DEFAULT_INTERESTS: string[] = [];
