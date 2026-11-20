import { Alert, Platform, Share } from 'react-native';

/** Share text via the OS sheet; on desktop web, copy it to the clipboard instead. */
export async function shareText(message: string, title?: string): Promise<'shared' | 'copied' | 'dismissed'> {
  if (Platform.OS === 'web') {
    const nav = globalThis.navigator;
    if (nav?.share) {
      try {
        await nav.share({ text: message, title });
        return 'shared';
      } catch {
        // User closed the sheet or share is blocked: fall back to copying.
      }
    }
    try {
      await nav?.clipboard?.writeText(message);
      return 'copied';
    } catch {
      window.prompt('Copy this:', message);
      return 'dismissed';
    }
  }
  const res = await Share.share({ message, title });
  return res.action === Share.sharedAction ? 'shared' : 'dismissed';
}

/** Cross-platform confirm dialog (Alert.alert has no buttons on web). */
export function confirm(title: string, message: string, confirmLabel = 'OK'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

/** Cross-platform notice. */
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

/** Public base URL used in share links (falls back to the custom scheme on native). */
export function appLink(path: string): string {
  const base = process.env.EXPO_PUBLIC_APP_URL;
  if (base) return `${base.replace(/\/$/, '')}${path}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}${path}`;
  return `openplay://${path.replace(/^\//, '')}`;
}
