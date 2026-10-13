import { Request, Response } from "express";
import { calculateLtv } from "../services/ltv.service";

export async function calculateLtvController(_req: Request, res: Response) {
  const startedAt = Date.now();
  const result = await calculateLtv();
  res.json({ success: true, data: { durationMs: Date.now() - startedAt, ...result } });
}
