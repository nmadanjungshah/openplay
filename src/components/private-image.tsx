import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';

import { Txt } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signedUrl } from '@/lib/storage';

type Props = {
  bucket: 'payment-qr' | 'payment-proofs';
  path: string;
  size?: number;
  /** Open the full image in the browser when tapped. */
  openOnPress?: boolean;
  label?: string;
};

/** Shows an image from a private Storage bucket via a short-lived signed URL. */
export function PrivateImage({ bucket, path, size = 220, openOnPress, label }: Props) {
  const c = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    signedUrl(bucket, path)
      .then((u) => active && setUrl(u))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [bucket, path]);

  const box = {
    width: size,
    height: size,
    borderRadius: Radius.md,
    backgroundColor: c.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  };

  if (failed) {
    return (
      <View style={box}>
        <Txt variant="small" tone="textSecondary">
          Image unavailable
        </Txt>
      </View>
    );
  }
  if (!url) {
    return (
      <View style={box}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }
  const img = (
    <Image
      source={{ uri: url }}
      style={{ width: size, height: size, borderRadius: Radius.md, backgroundColor: '#fff' }}
      contentFit="contain"
      accessibilityLabel={label}
    />
  );
  if (!openOnPress) return img;
  return (
    <Pressable onPress={() => Linking.openURL(url)} accessibilityRole="imagebutton" accessibilityLabel={label}>
      {img}
    </Pressable>
  );
}
