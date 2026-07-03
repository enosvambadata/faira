export const colors = {
  primary: '#C2501B',
  primaryDark: '#9C3F15',
  primaryLight: '#F7E4D9',
  gold: '#D9A441',
  dark: '#2E1A0D',
  bg: '#F5EFE2',
  white: '#FFFFFF',
  text: '#2E1A0D',
  muted: '#8A7A6E',
  border: '#E5DDD0',
  light: '#FAF6EF',
  red: '#C0392B',
  green: '#2E7D32',
  warning: '#D9A441',
} as const;

export type Color = keyof typeof colors;
