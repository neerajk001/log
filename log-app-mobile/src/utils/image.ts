import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/** Longest edge sent to the vision models — plenty to read a plate or a physique. */
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.7;

export interface UploadPhoto {
  uri: string;
  name: string;
  type: string;
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
    return { uri: saved.uri, name: "photo.jpg", type: "image/jpeg" };
  } catch {
    return original;
  }
}
