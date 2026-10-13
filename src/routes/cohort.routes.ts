import { Router } from "express";
import { getRetentionCohortController } from "../controllers/cohort.controller";

export const cohortRouter: Router = Router();

cohortRouter.get("/ltv-retention-cohort", getRetentionCohortController);
