import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../config";
import { AppError } from "../middleware/errorHandler";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ALGORITHM = "aes-256-gcm";

export interface EncryptedImage {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

/**
 * Reads the 32-byte key from PHYSIQUE_ENCRYPTION_KEY (base64 or hex). Throws a
 * user-facing 503 when it is missing or malformed — the feature fails closed,
 * so a body photo is never written unencrypted.
 */
function encryptionKey(): Buffer {
  const raw = config.physique.encryptionKey.trim();
  if (!raw) {
    throw new AppError(
      503,
      "PHYSIQUE_UNAVAILABLE",
      "Weekly physique check-ins aren't available right now.",
    );
  }
  const key = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new AppError(
      503,
      "PHYSIQUE_UNAVAILABLE",
      "Weekly physique check-ins aren't available right now.",
    );
  }
  return key;
}

/** True when the feature can store images (a valid key is configured). */
export function isPhysiqueEncryptionConfigured(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

/** AES-256-GCM encrypt; a fresh random IV is stored next to the ciphertext. */
export function encryptImage(plain: Buffer): EncryptedImage {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

/**
 * Decrypts one stored image. A wrong key or tampered ciphertext fails the GCM
 * authentication check and surfaces as a generic, non-leaking error.
 */
export function decryptImage(input: {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}): Buffer {
  if (input.iv.length !== IV_BYTES || input.tag.length !== TAG_BYTES) {
    throw new AppError(500, "PHYSIQUE_DECRYPT_FAILED", "Couldn't open that check-in.");
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), input.iv);
    decipher.setAuthTag(input.tag);
    return Buffer.concat([decipher.update(input.ciphertext), decipher.final()]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(500, "PHYSIQUE_DECRYPT_FAILED", "Couldn't open that check-in.");
  }
}
