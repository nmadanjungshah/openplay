import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    background: '#F5F7F2',
    surface: '#FFFFFF',
    surfaceAlt: '#EDF1E7',
    border: '#DCE2D4',
    text: '#14210F',
    textSecondary: '#5B6654',
    primary: '#1E6B43',
    primaryText: '#FFFFFF',
    accent: '#C7DE3A',
    accentText: '#1B2507',
    danger: '#B42318',
    success: '#1E6B43',
    warning: '#A15C07',
    successBg: '#E3F1E8',
    warningBg: '#FDF0DC',
    dangerBg: '#FCE7E4',
  },
  dark: {
    background: '#0E130C',
    surface: '#161D13',
    surfaceAlt: '#1F2819',
    border: '#2C3826',
    text: '#EEF3E9',
    textSecondary: '#A3AE9B',
    primary: '#4FBF83',
    primaryText: '#08130C',
    accent: '#C7DE3A',
    accentText: '#1B2507',
    danger: '#F97066',
    success: '#4FBF83',
    warning: '#F5B451',
    successBg: '#16301F',
    warningBg: '#33250F',
    dangerBg: '#3A1714',
  },
} as const;

export type ThemeColors = { [K in keyof typeof Colors.light]: string };
export type ThemeColor = keyof ThemeColors;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', rounded: 'ui-rounded', mono: 'ui-monospace' },
  web: { sans: 'var(--font-display)', rounded: 'var(--font-rounded)', mono: 'var(--font-mono)' },
  default: { sans: 'normal', rounded: 'normal', mono: 'monospace' },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const MaxContentWidth = 720;
