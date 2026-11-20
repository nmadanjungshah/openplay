import Ionicons from '@expo/vector-icons/Ionicons';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Radius, Spacing, type ThemeColor } from '@/constants/theme';
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
};

export function Screen({ children, refreshing, onRefresh, footer, hasHeader }: ScreenProps) {
  const c = useTheme();
  return (
    <SafeAreaView
      edges={hasHeader ? ['left', 'right'] : ['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.primary} />
          ) : undefined
        }>
        <View style={styles.column}>{children}</View>
      </ScrollView>
      {footer ? (
        <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <View style={styles.column}>{footer}</View>
        </SafeAreaView>
      ) : null}
    </SafeAreaView>
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
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const base = [styles.card, { backgroundColor: c.surface, borderColor: c.border }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [base, pressed && { opacity: 0.75 }]}>
      {children}
    </Pressable>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: Spacing.two }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="label">{title}</Txt>
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
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
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
    secondary: { bg: c.surface, fg: c.text, border: c.border },
    ghost: { bg: 'transparent', fg: c.primary, border: 'transparent' },
    danger: { bg: c.surface, fg: c.danger, border: c.border },
  }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: palette.bg, borderColor: palette.border },
        (pressed || inactive) && { opacity: inactive ? 0.5 : 0.8 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 16 : 18} color={palette.fg} /> : null}
          <Text style={[small ? styles.small : styles.bodyBold, { color: palette.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, style, ...input }: TextInputProps & { label: string; hint?: string }) {
  const c = useTheme();
  return (
    <View style={{ gap: Spacing.one }}>
      <Txt variant="label">{label}</Txt>
      <TextInput
        placeholderTextColor={c.textSecondary}
        {...input}
        style={[
          styles.input,
          { color: c.text, backgroundColor: c.surface, borderColor: c.border },
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
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? c.primary : c.surface,
          borderColor: selected ? c.primary : c.border,
        },
        pressed && { opacity: 0.8 },
      ]}>
      <Text style={[styles.small, { color: selected ? c.primaryText : c.text, fontWeight: '600' }]}>{label}</Text>
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
        { borderColor: c.border, backgroundColor: c.surface },
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.7 },
      ]}>
      <Ionicons name={icon} size={18} color={c.text} />
    </Pressable>
  );
  return (
    <View style={{ gap: Spacing.one, flex: 1, minWidth: 140 }}>
      <Txt variant="label">{label}</Txt>
      <Row>
        {btn('remove', Math.max(min, value - step), value <= min, `Decrease ${label}`)}
        <Txt variant="bodyBold" style={{ minWidth: 56, textAlign: 'center' }}>
          {format ? format(value) : value}
        </Txt>
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
    accent: { bg: c.accent, fg: c.accentText },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.badgeText, { color: colors.fg }]}>{label}</Text>
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
        backgroundColor: c.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ color: c.primary, fontWeight: '700', fontSize: size * 0.38 }}>{initials(name)}</Text>
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
    <View style={[styles.empty, { borderColor: c.border }]}>
      <Ionicons name={icon} size={32} color={c.textSecondary} />
      <Txt variant="bodyBold" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      <Txt variant="small" tone="textSecondary" style={{ textAlign: 'center' }}>
        {message}
      </Txt>
      {action}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const c = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: c.dangerBg }]} accessibilityRole="alert">
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
      <ActivityIndicator color={c.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Spacing.three, paddingBottom: Spacing.six, flexGrow: 1 },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  footer: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  h2: { fontSize: 19, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  bodyBold: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 19 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  button: {
    minHeight: 48,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  buttonSmall: { minHeight: 36, paddingHorizontal: Spacing.three },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.pill, borderWidth: 1 },
  stepperBtn: { width: 40, height: 40, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.five,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.md },
});
