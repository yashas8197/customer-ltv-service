import { findBrandById } from "../repositories/brand.repository";
import { getCohortLtvRows, getLatestTransactionMonth } from "../repositories/ltv.repository";
import { CohortGrid, CohortLtvRow, CohortQuery, RetentionCohortResponse } from "../types/cohort";
import { formatDate, monthsBetween } from "../utils/date";
import { AppError } from "../utils/errors";

// brands.json stores ISO codes; the frontend shows a symbol in front of each value.
const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  GBP: "£",
  AUD: "A$",
};

// Revenue has at most 2 decimal places.
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Builds the cohort table shown on the frontend from Table D rows.
//
// Each value is the total revenue of one acquisition cohort in one month gap.
// A month the cohort has lived through without any purchase is 0.
// A month gap that has not happened yet for a cohort is null, which gives the
// triangular shape. `ltvRows` must be sorted oldest cohort first.
export function buildCohortGrid(ltvRows: CohortLtvRow[], latestMonth: Date | null): CohortGrid {
  if (ltvRows.length === 0 || latestMonth === null) return { monthGaps: [], cohorts: [] };

  // Group the rows by cohort. A Map keeps the cohorts in the order they arrive (oldest first).
  const revenueByCohort = new Map<string, { cohortMonth: Date; revenueByGap: Map<number, number> }>();
  for (const row of ltvRows) {
    const cohortKey = formatDate(row.cohortMonth);
    if (!revenueByCohort.has(cohortKey)) {
      revenueByCohort.set(cohortKey, { cohortMonth: row.cohortMonth, revenueByGap: new Map() });
    }
    revenueByCohort.get(cohortKey)!.revenueByGap.set(row.monthGap, row.totalRevenue);
  }

  // The oldest cohort has the most months of history, so it sets the number of columns.
  const maxGap = Math.max(0, monthsBetween(ltvRows[0].cohortMonth, latestMonth));
  const monthGaps = Array.from({ length: maxGap + 1 }, (_, gap) => gap);

  const cohorts = [...revenueByCohort.entries()].map(([cohortKey, { cohortMonth, revenueByGap }]) => {
    const monthsOfHistory = monthsBetween(cohortMonth, latestMonth);

    const values = monthGaps.map((gap) => {
      if (gap > monthsOfHistory) return null;
      return round2(revenueByGap.get(gap) ?? 0);
    });

    return { cohortMonth: cohortKey, values };
  });

  return { monthGaps, cohorts };
}

export async function getRetentionCohort(query: CohortQuery): Promise<RetentionCohortResponse> {
  const { brandId, startMonth, endMonth } = query;

  const brand = await findBrandById(brandId);
  if (!brand) throw new AppError(`Brand not found: ${brandId}`, 404);

  const [ltvRows, latestMonth] = await Promise.all([
    getCohortLtvRows(brandId, startMonth, endMonth),
    getLatestTransactionMonth(brandId),
  ]);

  return {
    brandId,
    startMonth: formatDate(startMonth),
    endMonth: formatDate(endMonth),
    currency: CURRENCY_SYMBOLS[brand.currency] ?? brand.currency,
    ...buildCohortGrid(ltvRows, latestMonth),
  };
}
