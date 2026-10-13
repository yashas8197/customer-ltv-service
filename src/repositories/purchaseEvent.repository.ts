import { prisma } from "../lib/prisma";
import { PurchaseEventRow } from "../types/events";

// Inserts a batch of purchase events and returns how many were actually inserted.
// skipDuplicates becomes ON CONFLICT DO NOTHING on the event_id primary key,
// so rows that are already stored are left alone instead of being duplicated.
export async function insertPurchaseEvents(rows: PurchaseEventRow[]): Promise<number> {
  const { count } = await prisma.purchaseEvent.createMany({ data: rows, skipDuplicates: true });
  return count;
}

export async function countPurchaseEvents(): Promise<number> {
  return prisma.purchaseEvent.count();
}
