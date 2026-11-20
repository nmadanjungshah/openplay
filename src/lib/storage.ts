import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

export type PickedImage = { uri: string; mimeType: string; ext: string };

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** Let the user pick one image from their library. Returns null if they cancel. */
export async function pickImage(): Promise<PickedImage | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (res.canceled || !res.assets.length) return null;
  const asset = res.assets[0];
  const mimeType = asset.mimeType && EXT[asset.mimeType] ? asset.mimeType : 'image/jpeg';
  return { uri: asset.uri, mimeType, ext: EXT[mimeType] };
}

/** Upload a picked image to a private bucket. Returns the stored path. */
export async function uploadImage(bucket: 'payment-qr' | 'payment-proofs', path: string, image: PickedImage) {
  const body = await (await fetch(image.uri)).arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType: image.mimeType,
    upsert: true,
  });
  if (error) throw error;
  return path;
}

/** Short-lived URL for showing a private image. */
export async function signedUrl(bucket: 'payment-qr' | 'payment-proofs', path: string, seconds = 3600) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

export function randomFileId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
