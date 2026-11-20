import '@/global.css';

/**
 * OpenPlay design tokens: court navy + volt (ball) accent, cool neutrals.
 * `ink`/`navy`/`volt` are brand constants that stay the same in both schemes (hero panels, accents).
 */
export const Brand = {
  ink: '#07122B',
  navy: '#0E2557',
  navyLight: '#1B3A7A',
  volt: '#D7FF3D',
  voltDeep: '#B8E000',
  courtLine: 'rgba(255,255,255,0.14)',
} as const;

export const Colors = {
  light: {
    background: '#F2F4F8',
    surface: '#FFFFFF',
    surfaceAlt: '#E9EDF4',
    border: '#DCE2EC',
    text: '#0A1430',
    textSecondary: '#5B6579',
    primary: '#0E2557',
    primaryText: '#FFFFFF',
    accent: '#D7FF3D',
    accentText: '#0A1430',
    danger: '#D92D20',
    success: '#0F8A4B',
    warning: '#B54708',
    successBg: '#DFF6E8',
    warningBg: '#FFF0DB',
    dangerBg: '#FEE4E2',
    tint: '#0E2557',
  },
  dark: {
    background: '#060B17',
    surface: '#0E1628',
    surfaceAlt: '#16213A',
    border: '#22304D',
    text: '#F1F4FA',
    textSecondary: '#97A3BA',
    primary: '#D7FF3D',
    primaryText: '#07122B',
    accent: '#D7FF3D',
    accentText: '#07122B',
    danger: '#FF6B5E',
    success: '#3DDC84',
    warning: '#FDB022',
    successBg: '#0F2E21',
    warningBg: '#33240A',
    dangerBg: '#3A1512',
    tint: '#D7FF3D',
  },
} as const;

export type ThemeColors = { [K in keyof typeof Colors.light]: string };
export type ThemeColor = keyof ThemeColors;

/** Loaded in the root layout via expo-font. Use a family per weight (don't combine with fontWeight). */
export const FontFamily = {
  display: 'BarlowCondensed_800ExtraBold',
  displayBold: 'BarlowCondensed_700Bold',
  displaySemi: 'BarlowCondensed_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;

export const MaxContentWidth = 720;
