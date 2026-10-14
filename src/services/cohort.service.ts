import { findBrandById } from "../repositories/brand.repository";
import { getCohortLtvRows } from "../repositories/ltv.repository";
import { CohortGrid, CohortLtvRow, CohortQuery, RetentionCohortResponse } from "../types/cohort";
import { firstOfMonth, formatDate, monthsBetween } from "../utils/date";
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
// The columns are set by the requested range: from startMonth to endMonth is N
// months, so monthGaps is 0..N and every values array has N + 1 entries
// (confirmed by the coordinator on 2026-10-14).
//
// Each value is the total revenue of one acquisition cohort in one month gap.
// A month that has already started, up to and including `currentMonth`, is a
// number: 0 if the cohort made no purchases in it. A month after `currentMonth`
// has not happened yet and is null, which gives the triangular shape
// (confirmed by the coordinator on 2026-10-14). `currentMonth` is passed in
// rather than read from the clock so the function can be tested with a fixed date.
// `ltvRows` must be sorted oldest cohort first.
export function buildCohortGrid(
  ltvRows: CohortLtvRow[],
  startMonth: Date,
  endMonth: Date,
  currentMonth: Date,
): CohortGrid {
  const maxGap = monthsBetween(startMonth, endMonth);
  const monthGaps = Array.from({ length: maxGap + 1 }, (_, gap) => gap);

  if (ltvRows.length === 0) return { monthGaps, cohorts: [] };

  // Group the rows by cohort. A Map keeps the cohorts in the order they arrive (oldest first).
  const revenueByCohort = new Map<string, { cohortMonth: Date; revenueByGap: Map<number, number> }>();
  for (const row of ltvRows) {
    const cohortKey = formatDate(row.cohortMonth);
    if (!revenueByCohort.has(cohortKey)) {
      revenueByCohort.set(cohortKey, { cohortMonth: row.cohortMonth, revenueByGap: new Map() });
    }
    revenueByCohort.get(cohortKey)!.revenueByGap.set(row.monthGap, row.totalRevenue);
  }

  const cohorts = [...revenueByCohort.entries()].map(([cohortKey, { cohortMonth, revenueByGap }]) => {
    // Gaps 0..monthsOfHistory have started; anything later is in the future.
    const monthsOfHistory = monthsBetween(cohortMonth, currentMonth);

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

  const ltvRows = await getCohortLtvRows(brandId, startMonth, endMonth);
  const currentMonth = firstOfMonth(new Date());

  return {
    brandId,
    startMonth: formatDate(startMonth),
    endMonth: formatDate(endMonth),
    currency: CURRENCY_SYMBOLS[brand.currency] ?? brand.currency,
    ...buildCohortGrid(ltvRows, startMonth, endMonth, currentMonth),
  };
}
