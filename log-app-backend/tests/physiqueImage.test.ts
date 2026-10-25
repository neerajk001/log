import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config", () => ({
  config: { physique: { encryptionKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=" } },
}));

import {
  decryptImage,
  encryptImage,
  isPhysiqueEncryptionConfigured,
} from "../src/services/physiqueImage";

describe("physique image encryption", () => {
  it("round-trips an image buffer", () => {
    const plain = Buffer.from("a body photo as bytes");
    const encrypted = encryptImage(plain);

    expect(encrypted.ciphertext.equals(plain)).toBe(false);
    expect(encrypted.iv).toHaveLength(12);
    expect(encrypted.tag).toHaveLength(16);
    expect(decryptImage(encrypted).equals(plain)).toBe(true);
  });

  it("uses a fresh IV so identical images encrypt differently", () => {
    const plain = Buffer.from("same photo");
    const a = encryptImage(plain);
    const b = encryptImage(plain);

    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptImage(Buffer.from("photo"));
    const tampered = Buffer.from(encrypted.ciphertext);
    tampered[0] ^= 0xff;

    expect(() =>
      decryptImage({ ...encrypted, ciphertext: tampered }),
    ).toThrowError(expect.objectContaining({ code: "PHYSIQUE_DECRYPT_FAILED" }));
  });

  it("reports the feature as configured", () => {
    expect(isPhysiqueEncryptionConfigured()).toBe(true);
  });
});
