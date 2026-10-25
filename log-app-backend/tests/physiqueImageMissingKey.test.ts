import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config", () => ({
  config: { physique: { encryptionKey: "" } },
}));

import { encryptImage, isPhysiqueEncryptionConfigured } from "../src/services/physiqueImage";

describe("physique image encryption without a key", () => {
  it("fails closed instead of storing plaintext", () => {
    expect(isPhysiqueEncryptionConfigured()).toBe(false);
    expect(() => encryptImage(Buffer.from("photo"))).toThrowError(
      expect.objectContaining({ code: "PHYSIQUE_UNAVAILABLE", statusCode: 503 }),
    );
  });
});
