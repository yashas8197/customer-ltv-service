import express, { Request, Response } from "express";
import { errorHandler } from "./middleware/errorHandler.middleware";
import { notFound } from "./middleware/notFound.middleware";
import { router } from "./routes/routes";

export const app = express();

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ success: true });
});

app.use("/api/v1", router);

app.use(notFound);
app.use(errorHandler);
