export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const typography = {
  fontFamily,
  fontSizes: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    xxxl: 30,
  },
  fontWeights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

// Named scale — the presets to reach for first before composing fontSizes/fontFamily by hand.
export const textStyles = {
  h1: { fontFamily: fontFamily.bold, fontSize: 30, lineHeight: 30 * 1.2 },
  h2: { fontFamily: fontFamily.bold, fontSize: 24, lineHeight: 24 * 1.2 },
  h3: { fontFamily: fontFamily.semibold, fontSize: 20, lineHeight: 20 * 1.2 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 15 * 1.5 },
  bodyMedium: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 15 * 1.5 },
  caption: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 13 * 1.5 },
} as const;
