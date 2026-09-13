import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
export function notFound(req: Request, res: Response) { res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` }); }
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  if (err instanceof ZodError) return res.status(400).json({ message: "Validation failed", issues: err.issues });
  if (err?.code === 11000) return res.status(409).json({ message: "A record with the same unique value already exists" });
  const status = err?.statusCode ?? 500;
  res.status(status).json({ message: status === 500 ? "Internal server error" : err.message });
}