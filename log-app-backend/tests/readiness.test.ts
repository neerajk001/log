import { afterEach, describe, expect, it, vi } from "vitest";
import { checkDatabaseReadiness } from "../src/db/readiness";

afterEach(() => {
  vi.useRealTimers();
});

describe("checkDatabaseReadiness", () => {
  it("resolves when the database query succeeds", async () => {
    const query = vi.fn().mockResolvedValue([{ "?column?": 1 }]);

    await expect(checkDatabaseReadiness(query, 50)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledOnce();
  });

  it("propagates a database query failure", async () => {
    const query = vi.fn().mockRejectedValue(new Error("connection failed"));

    await expect(checkDatabaseReadiness(query, 50)).rejects.toThrow("connection failed");
  });

  it("rejects when the database query exceeds the timeout", async () => {
    vi.useFakeTimers();
    const query = vi.fn(() => new Promise(() => {}));
    const readiness = checkDatabaseReadiness(query, 3000);
    const expectedRejection = expect(readiness).rejects.toThrow(
      "Database readiness timed out",
    );

    await vi.advanceTimersByTimeAsync(3000);

    await expectedRejection;
  });
});
