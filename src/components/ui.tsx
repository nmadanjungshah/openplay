import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand, FontFamily, MaxContentWidth, Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { initials } from '@/lib/format';

export type IconName = ComponentProps<typeof Ionicons>['name'];

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

type ScreenProps = {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Bottom-pinned content such as a primary action. */
  footer?: ReactNode;
  /** Set when the screen sits under a native header (it already handles the top inset). */
  hasHeader?: boolean;
  /** Full-bleed header panel rendered above the content column (see <Hero>). */
  hero?: ReactNode;
};

export function Screen({ children, refreshing, onRefresh, footer, hasHeader, hero }: ScreenProps) {
  const c = useTheme();
  // A hero paints under the status bar itself, so only inset the top when there's neither a hero nor a header.
  const edges = hasHeader || hero ? (['left', 'right'] as const) : (['top', 'left', 'right'] as const);
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, hero ? { paddingTop: 0 } : null]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.tint} /> : undefined
        }>
        {hero}
        <View style={[styles.column, hero ? { marginTop: Spacing.three } : null]}>{children}</View>
      </ScrollView>
      {footer ? (
        <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <View style={styles.column}>{footer}</View>
        </SafeAreaView>
      ) : null}
    </SafeAreaView>
  );
}

/** Court markings drawn with plain views: outer lines, centre line and the kitchen (non-volley zone). */
function CourtLines() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.court, { top: 18, bottom: 18, left: '8%', right: '8%' }]} />
      <View style={[styles.courtLine, { top: 18, bottom: 18, left: '50%', width: 2 }]} />
      <View style={[styles.courtLine, { top: 18, bottom: 18, left: '38%', width: 2 }]} />
      <View style={[styles.courtLine, { top: 18, bottom: 18, left: '62%', width: 2 }]} />
    </View>
  );
}

type HeroProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Top-right action (e.g. a small button). */
  action?: ReactNode;
  /** Content under the title, e.g. a row of <HeroStat>. */
  children?: ReactNode;
  /** Set on screens that already have a native header above. */
  underHeader?: boolean;
};

/** Full-bleed navy panel with court lines: the athletic "scoreboard" header used on main screens. */
export function Hero({ eyebrow, title, subtitle, action, children, underHeader }: HeroProps) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={[Brand.ink, Brand.navy, Brand.navyLight]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, { paddingTop: (underHeader ? Spacing.three : insets.top + Spacing.four) }]}>
      <CourtLines />
      <View style={[styles.column, { gap: Spacing.two }]}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 2 }}>
            {eyebrow ? <Text style={styles.heroEyebrow}>{eyebrow}</Text> : null}
            <Text style={styles.heroTitle} accessibilityRole="header">
              {title}
            </Text>
          </View>
          {action}
        </Row>
        {subtitle ? <Text style={styles.heroSubtitle}>{subtitle}</Text> : null}
        {children}
      </View>
    </LinearGradient>
  );
}

/** Big number + label, for use inside <Hero>. */
export function HeroStat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <View style={styles.heroStat}>
      <Text style={[styles.heroStatValue, accent && { color: Brand.volt }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.heroStatLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Row({
  children,
  gap = Spacing.two,
  style,
  wrap,
}: {
  children: ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  wrap?: boolean;
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>
      {children}
    </View>
  );
}

export function Card({
  children,
  onPress,
  style,
  accent,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Volt stripe on the left edge to mark something as "yours" / active. */
  accent?: boolean;
}) {
  const c = useTheme();
  const base = [
    styles.card,
    { backgroundColor: c.surface, borderColor: c.border },
    accent && { borderLeftWidth: 4, borderLeftColor: Brand.volt },
    style,
  ];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        base,
        hovered && { borderColor: c.textSecondary },
        pressed && { transform: [{ scale: 0.99 }], opacity: 0.9 },
      ]}>
      {children}
    </Pressable>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const c = useTheme();
  return (
    <View style={{ gap: Spacing.two }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={Spacing.two}>
          <View style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: c.tint }} />
          <Txt variant="label">{title}</Txt>
        </Row>
        {action}
      </Row>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

type Variant = 'title' | 'h2' | 'body' | 'bodyBold' | 'small' | 'label';

export function Txt({
  variant = 'body',
  tone = 'text',
  style,
  ...rest
}: TextProps & { variant?: Variant; tone?: ThemeColor }) {
  const c = useTheme();
  return <Text {...rest} style={[styles[variant], { color: c[tone] }, style]} />;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'volt';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, small, style }: ButtonProps) {
  const c = useTheme();
  const palette = {
    primary: { bg: c.primary, fg: c.primaryText, border: c.primary },
    volt: { bg: Brand.volt, fg: Brand.ink, border: Brand.volt },
    secondary: { bg: c.surface, fg: c.text, border: c.border },
    ghost: { bg: 'transparent', fg: c.tint, border: 'transparent' },
    danger: { bg: c.surface, fg: c.danger, border: c.border },
  }[variant];
  const inactive = disabled || loading;
  // Disabled (not loading) filled buttons go neutral instead of a faded brand colour.
  const filled = variant === 'primary' || variant === 'volt';
  if (disabled && !loading && filled) Object.assign(palette, { bg: c.surfaceAlt, fg: c.textSecondary, border: c.border });
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: palette.bg, borderColor: palette.border },
        hovered && !inactive && { opacity: 0.92 },
        pressed && !inactive && { transform: [{ scale: 0.98 }] },
        inactive && { opacity: disabled && !loading && filled ? 1 : 0.5 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 15 : 18} color={palette.fg} /> : null}
          <Text style={[small ? styles.buttonTextSmall : styles.buttonText, { color: palette.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, style, ...input }: TextInputProps & { label: string; hint?: string }) {
  const c = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="label" tone="textSecondary">
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={c.textSecondary}
        accessibilityLabel={label}
        {...input}
        style={[
          styles.input,
          { color: c.text, backgroundColor: c.surfaceAlt, borderColor: c.border },
          input.multiline && { minHeight: 88, textAlignVertical: 'top' },
          style,
        ]}
      />
      {hint ? (
        <Txt variant="small" tone="textSecondary">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      // Chips pick one option from a set: expose them as radios so screen readers announce the selection.
      role="radio"
      aria-checked={!!selected}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? c.primary : c.surface,
          borderColor: selected ? c.primary : c.border,
        },
        pressed && { opacity: 0.85 },
      ]}>
      <Text style={[styles.chipText, { color: selected ? c.primaryText : c.text }]}>{label}</Text>
    </Pressable>
  );
}

/** Numeric +/- control. */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
}) {
  const c = useTheme();
  const btn = (icon: IconName, next: number, disabled: boolean, a11y: string) => (
    <Pressable
      onPress={() => onChange(next)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [
        styles.stepperBtn,
        { borderColor: c.border, backgroundColor: c.surfaceAlt },
        (pressed || disabled) && { opacity: disabled ? 0.35 : 0.7 },
      ]}>
      <Ionicons name={icon} size={18} color={c.text} />
    </Pressable>
  );
  return (
    <View style={{ gap: 6, flex: 1, minWidth: 140 }}>
      <Txt variant="label" tone="textSecondary">
        {label}
      </Txt>
      <Row>
        {btn('remove', Math.max(min, value - step), value <= min, `Decrease ${label}`)}
        <Text style={[styles.stepperValue, { color: c.text }]}>{format ? format(value) : value}</Text>
        {btn('add', Math.min(max, value + step), value >= max, `Increase ${label}`)}
      </Row>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent' }) {
  const c = useTheme();
  const colors = {
    neutral: { bg: c.surfaceAlt, fg: c.textSecondary },
    success: { bg: c.successBg, fg: c.success },
    warning: { bg: c.warningBg, fg: c.warning },
    danger: { bg: c.dangerBg, fg: c.danger },
    accent: { bg: Brand.volt, fg: Brand.ink },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.badgeText, { color: colors.fg }]}>{label}</Text>
    </View>
  );
}

/** Filled share of a capacity, e.g. players booked vs. spots. */
export function CapacityBar({ value, max, height = 6 }: { value: number; max: number; height?: number }) {
  const c = useTheme();
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const full = pct >= 1;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max, now: value }}
      style={{ height, borderRadius: height, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
      <View
        style={{
          width: `${pct * 100}%`,
          height: '100%',
          borderRadius: height,
          backgroundColor: full ? c.danger : pct >= 0.75 ? c.warning : c.success,
        }}
      />
    </View>
  );
}

/** Calendar-style date block: weekday, big day number, month. */
export function DateBlock({ date, highlight }: { date: Date; highlight?: boolean }) {
  const c = useTheme();
  const bg = highlight ? Brand.volt : c.primary;
  const fg = highlight ? Brand.ink : c.primaryText;
  return (
    <View style={[styles.dateBlock, { backgroundColor: bg }]}>
      <Text style={[styles.dateDow, { color: fg }]}>{date.toLocaleDateString(undefined, { weekday: 'short' })}</Text>
      <Text style={[styles.dateDay, { color: fg }]}>{date.getDate()}</Text>
      <Text style={[styles.dateDow, { color: fg }]}>{date.toLocaleDateString(undefined, { month: 'short' })}</Text>
    </View>
  );
}

/** Compact stat for cards: value over label. */
export function StatTile({ value, label, icon }: { value: string; label: string; icon?: IconName }) {
  const c = useTheme();
  return (
    <View style={[styles.statTile, { backgroundColor: c.surface, borderColor: c.border }]}>
      {icon ? <Ionicons name={icon} size={16} color={c.textSecondary} /> : null}
      <Text style={[styles.statValue, { color: c.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.textSecondary }]}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const c = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ color: c.primaryText, fontFamily: FontFamily.displayBold, fontSize: size * 0.42 }}>{initials(name)}</Text>
    </View>
  );
}

export function IconText({ icon, children, tone = 'textSecondary' }: { icon: IconName; children: ReactNode; tone?: ThemeColor }) {
  const c = useTheme();
  return (
    <Row gap={6}>
      <Ionicons name={icon} size={15} color={c[tone]} />
      <Txt variant="small" tone={tone} style={{ flexShrink: 1 }}>
        {children}
      </Txt>
    </Row>
  );
}

export function EmptyState({ icon, title, message, action }: { icon: IconName; title: string; message: string; action?: ReactNode }) {
  const c = useTheme();
  return (
    <View style={[styles.empty, { borderColor: c.border, backgroundColor: c.surface }]}>
      <View style={[styles.emptyIcon, { backgroundColor: c.surfaceAlt }]}>
        <Ionicons name={icon} size={26} color={c.tint} />
      </View>
      <Txt variant="h2" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      <Txt variant="small" tone="textSecondary" style={{ textAlign: 'center', maxWidth: 320 }}>
        {message}
      </Txt>
      {action}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const c = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: c.dangerBg, borderLeftColor: c.danger }]} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={18} color={c.danger} />
      <Txt variant="small" tone="danger" style={{ flex: 1 }}>
        {message}
      </Txt>
      {onRetry ? <Button title="Retry" variant="ghost" small onPress={onRetry} /> : null}
    </View>
  );
}

export function Loading() {
  const c = useTheme();
  return (
    <View style={{ paddingVertical: Spacing.six, alignItems: 'center' }}>
      <ActivityIndicator color={c.tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Spacing.three, paddingBottom: Spacing.six, flexGrow: 1 },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  footer: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  hero: {
    marginHorizontal: -Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    overflow: 'hidden',
  },
  court: { position: 'absolute', borderWidth: 2, borderColor: Brand.courtLine, borderRadius: 4 },
  courtLine: { position: 'absolute', backgroundColor: Brand.courtLine },
  heroEyebrow: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Brand.volt,
  },
  heroTitle: {
    fontFamily: FontFamily.display,
    fontSize: 40,
    lineHeight: 42,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: '#FFFFFF',
  },
  heroSubtitle: { fontFamily: FontFamily.body, fontSize: 15, lineHeight: 21, color: 'rgba(255,255,255,0.78)' },
  heroStat: {
    paddingVertical: Spacing.two,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    // Share the row evenly; stays on one line from ~320px up.
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 88,
    maxWidth: 200,
  },
  heroStatValue: { fontFamily: FontFamily.display, fontSize: 26, lineHeight: 28, color: '#FFFFFF' },
  heroStatLabel: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 10.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.7)',
  },
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two },
  title: { fontFamily: FontFamily.display, fontSize: 34, lineHeight: 36, textTransform: 'uppercase', letterSpacing: 0.3 },
  h2: { fontFamily: FontFamily.displayBold, fontSize: 22, lineHeight: 25, letterSpacing: 0.2 },
  body: { fontFamily: FontFamily.body, fontSize: 16, lineHeight: 23 },
  bodyBold: { fontFamily: FontFamily.bodySemi, fontSize: 16, lineHeight: 23 },
  small: { fontFamily: FontFamily.body, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: FontFamily.bodyBold, fontSize: 11.5, letterSpacing: 1.3, textTransform: 'uppercase' },
  button: {
    minHeight: 52,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  buttonSmall: { minHeight: 38, paddingHorizontal: 14, borderRadius: 10 },
  buttonText: { fontFamily: FontFamily.displayBold, fontSize: 19, letterSpacing: 0.8, textTransform: 'uppercase' },
  buttonTextSmall: { fontFamily: FontFamily.displayBold, fontSize: 15.5, letterSpacing: 0.6, textTransform: 'uppercase' },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    fontFamily: FontFamily.bodyMedium,
  },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.pill, borderWidth: 1 },
  chipText: { fontFamily: FontFamily.bodySemi, fontSize: 14 },
  stepperBtn: { width: 42, height: 42, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { fontFamily: FontFamily.display, fontSize: 26, minWidth: 56, textAlign: 'center' },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: Radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontFamily: FontFamily.bodyBold, fontSize: 11.5, letterSpacing: 0.5, textTransform: 'uppercase' },
  dateBlock: { width: 58, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  dateDow: { fontFamily: FontFamily.bodyBold, fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase' },
  dateDay: { fontFamily: FontFamily.display, fontSize: 30, lineHeight: 32 },
  statTile: { flex: 1, minWidth: 96, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.three, gap: 2 },
  statValue: { fontFamily: FontFamily.display, fontSize: 26, lineHeight: 28 },
  statLabel: { fontFamily: FontFamily.bodySemi, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.five,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderLeftWidth: 4,
  },
});
