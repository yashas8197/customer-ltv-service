import { Request, Response } from "express";
import { getRetentionCohort } from "../services/cohort.service";
import { validateCohortQuery } from "../validators/cohort.validator";

export async function getRetentionCohortController(req: Request, res: Response) {
  const query = validateCohortQuery(req.query);
  const data = await getRetentionCohort(query);
  res.json({ success: true, data });
}
