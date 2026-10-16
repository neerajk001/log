import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findOrCreateUserByClerkId } from "../src/middleware/auth";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  findUniqueOrThrow: vi.fn(),
}));

vi.mock("../src/db/client", () => ({
  prisma: {
    user: {
      findUnique: mocks.findUnique,
      create: mocks.create,
      findUniqueOrThrow: mocks.findUniqueOrThrow,
    },
  },
}));

function p2002() {
  return new Prisma.PrismaClientKnownRequestError("duplicate", {
    code: "P2002",
    clientVersion: "6.0.0",
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  mocks.findUnique.mockReset().mockResolvedValue({ id: "user-1" });
  mocks.create.mockReset();
  mocks.findUniqueOrThrow.mockReset();
});

describe("findOrCreateUserByClerkId cache", () => {
  it("hits the cache on repeat lookups within the TTL", async () => {
    await expect(findOrCreateUserByClerkId("clerk-A")).resolves.toBe("user-1");
    await expect(findOrCreateUserByClerkId("clerk-A")).resolves.toBe("user-1");
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
  });

  it("refetches after the 60s TTL expires", async () => {
    await findOrCreateUserByClerkId("clerk-B");
    vi.setSystemTime(new Date("2026-10-15T12:01:01Z"));
    await findOrCreateUserByClerkId("clerk-B");
    expect(mocks.findUnique).toHaveBeenCalledTimes(2);
  });

  it("caches the create path (no duplicate inserts on retry)", async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    mocks.create.mockResolvedValue({ id: "user-2" });

    await expect(findOrCreateUserByClerkId("clerk-C")).resolves.toBe("user-2");
    await expect(findOrCreateUserByClerkId("clerk-C")).resolves.toBe("user-2");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("caches the P2002 race-recovery path", async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    mocks.create.mockRejectedValueOnce(p2002());
    mocks.findUniqueOrThrow.mockResolvedValue({ id: "user-3" });

    await expect(findOrCreateUserByClerkId("clerk-D")).resolves.toBe("user-3");
    await expect(findOrCreateUserByClerkId("clerk-D")).resolves.toBe("user-3");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.findUniqueOrThrow).toHaveBeenCalledTimes(1);
  });
});
