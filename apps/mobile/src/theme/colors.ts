export const colors = {
  teal: '#09B1BA',
  tealDark: '#077F86',
  tealLight: '#E6F7F8',
  bg: '#F0F0EB',
  white: '#FFFFFF',
  text: '#2E2E2E',
  muted: '#717171',
  border: '#E0E0DA',
  light: '#F7F7F4',
  red: '#E53935',
  green: '#2E7D32',
  warning: '#F57C00',
} as const;

export type Color = keyof typeof colors;
