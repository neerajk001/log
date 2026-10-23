import { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Safe server-side log: never include the error message or request body. */
export function logUnhandledError(err: unknown): void {
  const name = err instanceof Error ? err.name : "UnknownError";
  const stack = err instanceof Error ? (err.stack ?? "").split("\n").slice(1).join("\n") : "";
  console.error("Unhandled error:", name, stack);
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  if (
    err.name === "PrismaClientKnownRequestError" &&
    (err as { code?: string }).code === "P2025"
  ) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Resource not found" },
    });
    return;
  }

  // Body-parser and other HTTP errors already carry a 4xx status. Map them
  // instead of turning malformed/oversize JSON into a false 500.
  const status = Number(
    (err as { status?: unknown; statusCode?: unknown }).status ??
      (err as { statusCode?: unknown }).statusCode,
  );
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    const code =
      status === 413
        ? "PAYLOAD_TOO_LARGE"
        : status === 415
          ? "UNSUPPORTED_MEDIA_TYPE"
          : status === 400
            ? "INVALID_BODY"
            : "REQUEST_ERROR";
    const message =
      status === 413
        ? "Request body is too large"
        : status === 415
          ? "Unsupported request format"
          : "Invalid request";
    res.status(status).json({ error: { code, message } });
    return;
  }

  logUnhandledError(err);

  res.status(500).json({
    error: {
      code: "SERVER_ERROR",
      message: "Internal server error",
    },
  });
}
