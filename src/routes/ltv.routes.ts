import { Router } from "express";
import { calculateLtvController } from "../controllers/ltv.controller";

export const ltvRouter: Router = Router();

ltvRouter.post("/calculate-ltv", calculateLtvController);
