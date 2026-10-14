import { File } from "expo-file-system";

/**
 * A file part for a multipart `fetch` body.
 *
 * Expo's `fetch` (the global one) serialises the multipart body itself and only accepts
 * strings, Blobs, or objects exposing `bytes()` — React Native's legacy
 * `{ uri, name, type }` part makes it throw "Unsupported FormDataPart implementation".
 * `expo-file-system`'s `File` reads the bytes, and name/type are passed explicitly so the
 * server sees exactly the filename and content type it validates the upload against.
 */
export function filePart(uri: string, name: string, type: string): Blob {
  const file = new File(uri);
  return { name, type, bytes: () => file.bytes() } as unknown as Blob;
}
