import { prisma } from "../lib/prisma";
import { BrandEntry } from "../types/events";

export async function findBrandById(brandId: string): Promise<BrandEntry | null> {
  const brand = await prisma.brand.findUnique({ where: { brandId } });
  return brand ? { brand_id: brand.brandId, currency: brand.currency } : null;
}

// Inserts new brands and updates the currency of existing ones.
export async function upsertBrands(brands: BrandEntry[]): Promise<void> {
  for (const brand of brands) {
    await prisma.brand.upsert({
      where: { brandId: brand.brand_id },
      create: { brandId: brand.brand_id, currency: brand.currency },
      update: { currency: brand.currency },
    });
  }
}
