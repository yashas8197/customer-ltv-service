import { rebuildLtvTables } from "../repositories/ltv.repository";
import { countPurchaseEvents } from "../repositories/purchaseEvent.repository";
import { AppError } from "../utils/errors";

// A second request is rejected while a calculation is still running.
let calculationRunning = false;

export async function calculateLtv() {
  if (calculationRunning) throw new AppError("LTV calculation is already running", 409);

  calculationRunning = true;
  try {
    if ((await countPurchaseEvents()) === 0) {
      throw new AppError("No purchase events found. Run POST /api/v1/ingest-data first", 409);
    }

    return await rebuildLtvTables();
  } finally {
    calculationRunning = false;
  }
}
