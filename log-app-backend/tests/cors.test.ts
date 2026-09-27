import { describe, it, expect } from "vitest";
import { isAllowedOrigin, parseAllowedOrigins } from "../src/cors";

describe("isAllowedOrigin", () => {
  it("allows requests with no Origin (native mobile, curl)", () => {
    expect(isAllowedOrigin(undefined, [])).toBe(true);
  });

  it("denies everything when allowlist is empty", () => {
    expect(isAllowedOrigin("https://evil.test", [])).toBe(false);
  });

  it("allows a listed origin", () => {
    expect(isAllowedOrigin("http://localhost:8081", ["http://localhost:8081"])).toBe(true);
  });

  it("rejects unlisted origins and subdomain lookalikes", () => {
    const allowed = ["https://app.example.com"];
    expect(isAllowedOrigin("https://evil.test", allowed)).toBe(false);
    expect(isAllowedOrigin("https://app.example.com.evil.test", allowed)).toBe(false);
  });

  it("handles trailing slashes and whitespace in env", () => {
    const allowed = parseAllowedOrigins(" https://app.example.com/, http://localhost:8081 ");
    expect(allowed).toEqual(["https://app.example.com", "http://localhost:8081"]);
    expect(isAllowedOrigin("https://app.example.com", allowed)).toBe(true);
    expect(isAllowedOrigin("https://app.example.com/", allowed)).toBe(true);
    expect(isAllowedOrigin("http://localhost:8081", allowed)).toBe(true);
  });
});
