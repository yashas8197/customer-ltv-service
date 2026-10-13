import { Request, Response } from "express";
import { ingestData } from "../services/ingest.service";

export async function ingestDataController(_req: Request, res: Response) {
  const startedAt = Date.now();
  const result = await ingestData();
  res.json({ success: true, data: { durationMs: Date.now() - startedAt, ...result } });
}
