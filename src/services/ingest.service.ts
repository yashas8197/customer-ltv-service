import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { env } from "../config/env";
import { upsertBrands } from "../repositories/brand.repository";
import { insertPurchaseEvents } from "../repositories/purchaseEvent.repository";
import { BrandEntry, PurchaseEventRow, RawEvent } from "../types/events";
import { AppError } from "../utils/errors";

// 8 columns per row, so 2000 rows stays well under Postgres's 65535 bind parameter limit.
const BATCH_SIZE = 2000;

const AMOUNT_PATTERN = /^\d+(\.\d+)?$/;

const CUSTOMER_TYPES = ["first-time", "returning"];

export type FileIngestResult = {
  file: string;
  linesRead: number;
  purchaseEvents: number;
  inserted: number;
  alreadyPresent: number;
  invalid: number;
};

// Ingestion takes a while, so a second request is rejected while one is still running.
let ingestionRunning = false;

function dataFilePath(fileName: string): string {
  const filePath = path.join(env.dataDir, fileName);
  if (!fs.existsSync(filePath)) {
    throw new AppError(`Data file not found: ${fileName} (looked in ${env.dataDir})`, 500);
  }
  return filePath;
}

function readBrands(): BrandEntry[] {
  return JSON.parse(fs.readFileSync(dataFilePath("brands.json"), "utf8"));
}

// Turns one NDJSON line into a row for purchase_events.
// Returns null for non-purchase events and "invalid" for lines we cannot use.
// brandId is the brand the file belongs to; an event for any other brand is rejected.
function toPurchaseRow(line: string, brandId: string): PurchaseEventRow | null | "invalid" {
  let event: Partial<RawEvent> | null;
  try {
    event = JSON.parse(line);
  } catch {
    return "invalid";
  }

  if (event?.event_type !== "purchase") return null;

  const { event_id, brand_id, user_id, event_type, customer_type, received_at } = event;
  const orderId = event.properties?.order_id;
  const amount = event.properties?.amount;

  if (
    typeof event_id !== "string" ||
    brand_id !== brandId ||
    typeof user_id !== "string" ||
    typeof customer_type !== "string" ||
    !CUSTOMER_TYPES.includes(customer_type) ||
    typeof received_at !== "string" ||
    typeof orderId !== "string" ||
    typeof amount !== "string" ||
    !AMOUNT_PATTERN.test(amount)
  ) {
    return "invalid";
  }

  // new Date() reads the UTC offset in the string, so this is the correct absolute instant
  const receivedAt = new Date(received_at);
  if (Number.isNaN(receivedAt.getTime())) return "invalid";

  return {
    eventId: event_id,
    brandId: brand_id,
    userId: user_id,
    eventType: event_type,
    customerType: customer_type,
    receivedAt,
    orderId,
    // kept as a string so it is written as an exact decimal, never a float
    amount,
  };
}

async function ingestFile(brandId: string): Promise<FileIngestResult> {
  const fileName = `${brandId}.ndjson`;
  const result: FileIngestResult = {
    file: fileName,
    linesRead: 0,
    purchaseEvents: 0,
    inserted: 0,
    alreadyPresent: 0,
    invalid: 0,
  };

  let batch: PurchaseEventRow[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const inserted = await insertPurchaseEvents(batch);
    result.inserted += inserted;
    result.alreadyPresent += batch.length - inserted;
    batch = [];
  };

  // Stream the file line by line; the files are too large to load into memory.
  const lines = readline.createInterface({
    input: fs.createReadStream(dataFilePath(fileName)),
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    if (line.trim() === "") continue;
    result.linesRead++;

    const row = toPurchaseRow(line, brandId);
    if (row === null) continue;
    if (row === "invalid") {
      result.invalid++;
      continue;
    }

    result.purchaseEvents++;
    batch.push(row);
    // Awaiting here pauses reading until the batch is written, so memory stays flat.
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  return result;
}

export async function ingestData() {
  if (ingestionRunning) throw new AppError("Ingestion is already running", 409);

  ingestionRunning = true;
  try {
    const brands = readBrands();
    await upsertBrands(brands);

    // One file per brand; the files are independent so they are ingested in parallel.
    const files = await Promise.all(brands.map((brand) => ingestFile(brand.brand_id)));

    const totals = files.reduce(
      (sum, file) => ({
        linesRead: sum.linesRead + file.linesRead,
        purchaseEvents: sum.purchaseEvents + file.purchaseEvents,
        inserted: sum.inserted + file.inserted,
        alreadyPresent: sum.alreadyPresent + file.alreadyPresent,
        invalid: sum.invalid + file.invalid,
      }),
      { linesRead: 0, purchaseEvents: 0, inserted: 0, alreadyPresent: 0, invalid: 0 },
    );

    return { brands: brands.length, totals, files };
  } finally {
    ingestionRunning = false;
  }
}
