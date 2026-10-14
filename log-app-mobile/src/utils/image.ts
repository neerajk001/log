import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

/** Longest edge sent to the vision models — plenty to read a plate or a physique. */
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.7;

export interface UploadPhoto {
  uri: string;
  name: string;
  type: string;
}

export type PhotoSource = "camera" | "library";

/** A picked image, a plain-language reason we can't get one, or null if cancelled. */
export type PhotoPick = { asset: ImagePicker.ImagePickerAsset } | { error: string } | null;

/**
 * Snaps a photo or opens the library. Compression is left to `preparePhoto`, so the
 * picker returns the full-quality original rather than compressing twice.
 */
export async function pickPhoto(source: PhotoSource): Promise<PhotoPick> {
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    return {
      error:
        source === "camera"
          ? "Camera access is off. Turn it on in your phone settings to snap a photo."
          : "Photo access is off. Turn it on in your phone settings to choose one.",
    };
  }

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });

  if (result.canceled || result.assets.length === 0) return null;
  return { asset: result.assets[0] };
}

/**
 * Shrinks a picked photo before it goes to a vision model. Both the token cost and the
 * base64 payload scale with pixels, and nothing downstream needs more than 1280 px on
 * the long edge. Falls back to the original file if manipulation fails, so a photo can
 * always be logged.
 */
export async function preparePhoto(asset: {
  uri: string;
  width?: number;
  height?: number;
  name?: string | null;
  mimeType?: string | null;
}): Promise<UploadPhoto> {
  const original: UploadPhoto = {
    uri: asset.uri,
    name: asset.name ?? "photo.jpg",
    type: asset.mimeType ?? "image/jpeg",
  };

  try {
    const context = ImageManipulator.manipulate(asset.uri);
    const { width, height } = asset;
    // Downscale only: a photo already inside the bound keeps its size, and unknown
    // dimensions just get re-encoded rather than guessed at (which could upscale).
    if (width != null && height != null && Math.max(width, height) > MAX_EDGE) {
      context.resize(width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE });
    }
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
    if (__DEV__) {
      console.log(`[photo] resized to ${saved.width}x${saved.height} -> ${saved.uri}`);
    }
    return { uri: saved.uri, name: "photo.jpg", type: "image/jpeg" };
  } catch (err) {
    // The upload uses this URI as-is, so the original picker path (which can be a
    // ph:// asset on iOS) has to be visible when the upload later fails.
    if (__DEV__) {
      console.warn(`[photo] resize failed, uploading the original -> ${original.uri}`, err);
    }
    return original;
  }
}
