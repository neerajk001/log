import { describe, it, expect } from "vitest";
import { buildPoolSslConfig, assertDbSslAllowed } from "../src/db/client";

const BASE = "postgresql://user:password@host:5432/log";

describe("buildPoolSslConfig", () => {
  it("verifies by default (missing sslmode)", () => {
    expect(buildPoolSslConfig(BASE)).toEqual({ rejectUnauthorized: true });
  });

  it("verifies for require / verify-ca / verify-full", () => {
    for (const mode of ["require", "verify-ca", "verify-full"]) {
      expect(buildPoolSslConfig(`${BASE}?sslmode=${mode}`)).toEqual({
        rejectUnauthorized: true,
      });
    }
  });

  it("returns plaintext for sslmode=disable", () => {
    expect(buildPoolSslConfig(`${BASE}?sslmode=disable`)).toBe(false);
  });

  it("disables verification for sslmode=no-verify", () => {
    expect(buildPoolSslConfig(`${BASE}?sslmode=no-verify`)).toEqual({
      rejectUnauthorized: false,
    });
  });

  it("disables verification when sslNoVerify flag is set", () => {
    expect(buildPoolSslConfig(`${BASE}?sslmode=require`, true)).toEqual({
      rejectUnauthorized: false,
    });
  });
});

describe("assertDbSslAllowed", () => {
  it("throws in production when verification is disabled", () => {
    expect(() => assertDbSslAllowed(false, "production")).toThrow(
      /refusing to start/i,
    );
    expect(() =>
      assertDbSslAllowed({ rejectUnauthorized: false }, "production"),
    ).toThrow(/refusing to start/i);
  });

  it("passes in production when verifying", () => {
    expect(() =>
      assertDbSslAllowed({ rejectUnauthorized: true }, "production"),
    ).not.toThrow();
  });

  it("passes in development even when disabled", () => {
    expect(() =>
      assertDbSslAllowed({ rejectUnauthorized: false }, "development"),
    ).not.toThrow();
  });
});
