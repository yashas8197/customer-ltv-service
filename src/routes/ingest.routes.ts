import { Router } from "express";
import { ingestDataController } from "../controllers/ingest.controller";

export const ingestRouter: Router = Router();

ingestRouter.post("/ingest-data", ingestDataController);
