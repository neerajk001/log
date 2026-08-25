import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { AppError } from "./errorHandler";

type ValidationTarget = "body" | "query" | "params";

export function validate(schema: ZodSchema, target: ValidationTarget = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const data = target === "body" ? req.body : target === "query" ? req.query : req.params;
      const parsed = schema.parse(data);

      if (target === "body") req.body = parsed;
      else if (target === "query") Object.assign(req.query, parsed);
      else req.params = parsed as any;

      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const message = err.issues.map((i) => i.message).join("; ");
        next(new AppError(400, "VALIDATION_ERROR", message));
      } else {
        next(err);
      }
    }
  };
}
