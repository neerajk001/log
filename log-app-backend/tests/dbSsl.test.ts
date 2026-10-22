import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPoolSslConfig, assertDbSslAllowed, stripSslMode } from "../src/db/client";

const BASE = "postgresql://user:password@host:5432/log";

const pem = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n";
const dir = mkdtempSync(join(tmpdir(), "ca-"));
const caPath = join(dir, "prod-ca-2021.crt");
writeFileSync(caPath, pem);

const originalCa = process.env.DATABASE_SSL_CA;

beforeEach(() => {
  // The developer's .env may set the Supabase CA. Defaults must be tested without it.
  delete process.env.DATABASE_SSL_CA;
});

afterAll(() => {
  if (originalCa === undefined) delete process.env.DATABASE_SSL_CA;
  else process.env.DATABASE_SSL_CA = originalCa;
  rmSync(dir, { recursive: true, force: true });
});

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

  it("trusts a configured CA while keeping verification on", () => {
    expect(buildPoolSslConfig(`${BASE}?sslmode=require`, false, caPath)).toEqual({
      ca: pem,
      rejectUnauthorized: true,
    });
  });

  it("still wins over sslmode=require for a self-signed pooler chain", () => {
    // Supabase's pooler: require would verify-full against the public store and
    // fail, so the CA must reach pg (see stripSslMode).
    const ssl = buildPoolSslConfig(`${BASE}?sslmode=require`, false, caPath);
    expect(ssl).toMatchObject({ ca: pem });
  });

  it("refuses to start when the CA path cannot be read", () => {
    expect(() => buildPoolSslConfig(BASE, false, join(dir, "missing.crt"))).toThrow(
      /could not be read/i,
    );
  });
});

describe("stripSslMode", () => {
  it("drops sslmode so the explicit ssl object is authoritative", () => {
    expect(stripSslMode(`${BASE}?sslmode=require`)).toBe(BASE);
    expect(stripSslMode(`${BASE}?sslmode=require&application_name=x`)).toBe(
      `${BASE}?application_name=x`,
    );
  });

  it("leaves the URL untouched when there is no sslmode", () => {
    expect(stripSslMode(BASE)).toBe(BASE);
    expect(stripSslMode(`${BASE}?foo=bar`)).toBe(`${BASE}?foo=bar`);
  });

  it("passes through undefined and unparseable values", () => {
    expect(stripSslMode(undefined)).toBeUndefined();
    expect(stripSslMode("not a url")).toBe("not a url");
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
