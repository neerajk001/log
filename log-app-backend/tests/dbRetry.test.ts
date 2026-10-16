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

  it("recognises the pg-adapter P2010 shape with an embedded connection code", () => {
    // This is exactly how the production failures arrive: the pg code lives in
    // the message, not in `err.code` (which is the generic P2010).
    const terminated = known(
      "P2010",
    ) as Prisma.PrismaClientKnownRequestError & { message: string };
    terminated.message =
      "Invalid `prisma.coachMemory.findUnique()` invocation:\n\n" +
      "Raw query failed. Code: `57P01`. Message: `terminating connection due to administrator command`";
    expect(shouldRetryDbOperation(terminated, "findUnique")).toBe(true);
    expect(shouldRetryDbOperation(terminated, "update")).toBe(false);

    const protocol = new Error(
      "Invalid `prisma.dailyLog.findMany()` invocation:\n\n" +
        "Raw query failed. Code: `08P01`. Message: `unexpected message type`",
    );
    expect(shouldRetryDbOperation(protocol, "findMany")).toBe(true);

    const tooMany = new Error(
      "Raw query failed. Code: `53300`. Message: `sorry, too many clients already`",
    );
    expect(shouldRetryDbOperation(tooMany, "count")).toBe(true);
  });

  it("does not retry a P2010 that is a genuine query problem", () => {
    const syntax = new Error(
      "Invalid `prisma.$queryRaw()` invocation:\n\n" +
        "Raw query failed. Code: `42601`. Message: `syntax error at or near \"FROM\"`",
    );
    expect(shouldRetryDbOperation(syntax, "findMany")).toBe(false);
  });

  it("matches driver error text without a Prisma code", () => {
    expect(
      shouldRetryDbOperation(new Error("terminating connection due to administrator command"), "findMany"),
    ).toBe(true);
    expect(
      shouldRetryDbOperation(new Error("This connection has been closed."), "findMany"),
    ).toBe(true);
    expect(
      shouldRetryDbOperation(new Error("Connection terminated unexpectedly"), "findFirst"),
    ).toBe(true);
    expect(
      shouldRetryDbOperation(new Error("terminating connection due to administrator command"), "create"),
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

  it("supports an extra attempt for reads (three total)", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("Server has closed the connection."))
      .mockRejectedValueOnce(new Error("Server has closed the connection."))
      .mockResolvedValueOnce("ok");

    await expect(runWithRetry("findMany", run, { maxAttempts: 3, sleep: noSleep })).resolves.toBe(
      "ok",
    );
    expect(run).toHaveBeenCalledTimes(3);
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
