import { Router } from "express";
import { cohortRouter } from "./cohort.routes";
import { ingestRouter } from "./ingest.routes";
import { ltvRouter } from "./ltv.routes";

// Everything here is mounted under /api/v1 in app.ts
export const router: Router = Router();

router.use(ingestRouter);
router.use(ltvRouter);
router.use(cohortRouter);
