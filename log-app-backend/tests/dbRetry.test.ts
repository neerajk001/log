import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { operationIsRead, runWithRetry, shouldRetryDbOperation } from "../src/db/retry";

const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("boom", { code, clientVersion: "6.0.0" });
const initError = () =>
  new Prisma.PrismaClientInitializationError("can't reach the database", "6.0.0");
const validationError = () =>
  new Prisma.PrismaClientValidationError("invalid arguments", { clientVersion: "6.0.0" });

describe("shouldRetryDbOperation", () => {
  it("retries connection-setup failures for any operation (the query never ran)", () => {
    expect(shouldRetryDbOperation(initError(), "create")).toBe(true);
    expect(shouldRetryDbOperation(known("P2024"), "update")).toBe(true);
  });

  it("retries mid-query connection failures for reads only", () => {
    expect(shouldRetryDbOperation(known("P1017"), "findMany")).toBe(true);
    expect(shouldRetryDbOperation(known("P1017"), "create")).toBe(false);
    expect(
      shouldRetryDbOperation(new Error("Server has closed the connection."), "findUnique"),
    ).toBe(true);
    expect(
      shouldRetryDbOperation(new Error("Server has closed the connection."), "updateMany"),
    ).toBe(false);
  });

  it("never retries validation or business errors", () => {
    expect(shouldRetryDbOperation(validationError(), "findMany")).toBe(false);
    expect(shouldRetryDbOperation(known("P2002"), "create")).toBe(false);
    expect(shouldRetryDbOperation(new Error("Unique constraint failed"), "create")).toBe(false);
  });

  it("knows which operations are reads", () => {
    expect(operationIsRead("findUnique")).toBe(true);
    expect(operationIsRead("groupBy")).toBe(true);
    expect(operationIsRead("createMany")).toBe(false);
  });
});

describe("runWithRetry", () => {
  const noSleep = async () => {};

  it("retries once and succeeds", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("Server has closed the connection."))
      .mockResolvedValueOnce("ok");

    await expect(runWithRetry("findMany", run, { sleep: noSleep })).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("gives up after the attempt limit and surfaces the original failure", async () => {
    const run = vi.fn().mockRejectedValue(new Error("Server has closed the connection."));

    await expect(runWithRetry("findMany", run, { sleep: noSleep })).rejects.toThrow(
      "closed the connection",
    );
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not replay a write when the failure is ambiguous", async () => {
    const run = vi.fn().mockRejectedValue(new Error("Server has closed the connection."));

    await expect(runWithRetry("create", run, { sleep: noSleep })).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
