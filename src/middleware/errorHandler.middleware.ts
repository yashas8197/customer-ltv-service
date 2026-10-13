import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/errors";

// Express 5 forwards errors thrown in async handlers here.
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, error: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ success: false, error: "Internal server error" });
}
