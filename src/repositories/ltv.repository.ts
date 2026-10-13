import { prisma } from "../lib/prisma";
import { CohortLtvRow } from "../types/cohort";

export type LtvTableCounts = {
  customerCohorts: number;
  customerMonthlyRevenueRows: number;
  cohortLtvRows: number;
};

// Rebuilds tables B, C and D from table A (purchase_events).
// Everything runs in one transaction: the tables are emptied and refilled together,
// so running it again gives the same result and a failure leaves the old data in place.
// The aggregation is done by Postgres in three INSERT ... SELECT statements, not row by row in Node.
export async function rebuildLtvTables(): Promise<LtvTableCounts> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`TRUNCATE TABLE customer_cohorts, customer_monthly_revenue, cohort_ltv`;

      // Table B: the month of each customer's first purchase.
      // received_at is timestamptz, so AT TIME ZONE 'UTC' gives the UTC wall-clock time
      // before the date and month are taken.
      const customerCohorts = await tx.$executeRaw`
        INSERT INTO customer_cohorts (brand_id, user_id, first_order_date, acquisition_cohort)
        SELECT
          brand_id,
          user_id,
          (min(received_at) AT TIME ZONE 'UTC')::date,
          date_trunc('month', min(received_at) AT TIME ZONE 'UTC')::date
        FROM purchase_events
        WHERE customer_type = 'first-time'
        GROUP BY brand_id, user_id
      `;

      // Table C: revenue per customer per UTC calendar month.
      const customerMonthlyRevenueRows = await tx.$executeRaw`
        INSERT INTO customer_monthly_revenue (brand_id, user_id, transaction_month, total_revenue)
        SELECT
          brand_id,
          user_id,
          date_trunc('month', received_at AT TIME ZONE 'UTC')::date,
          sum(amount)
        FROM purchase_events
        GROUP BY 1, 2, 3
      `;

      // Table D: join C to B, turn the two months into a month gap, and sum per cohort.
      const cohortLtvRows = await tx.$executeRaw`
        INSERT INTO cohort_ltv (brand_id, acquisition_cohort, month_gap, total_revenue)
        SELECT
          c.brand_id,
          c.acquisition_cohort,
          (
            (extract(year FROM m.transaction_month) - extract(year FROM c.acquisition_cohort)) * 12
            + (extract(month FROM m.transaction_month) - extract(month FROM c.acquisition_cohort))
          )::int,
          sum(m.total_revenue)
        FROM customer_monthly_revenue m
        JOIN customer_cohorts c ON c.brand_id = m.brand_id AND c.user_id = m.user_id
        WHERE m.transaction_month >= c.acquisition_cohort
        GROUP BY 1, 2, 3
      `;

      return { customerCohorts, customerMonthlyRevenueRows, cohortLtvRows };
    },
    // The default transaction timeout is 5 seconds, which is too short for a full rebuild.
    { maxWait: 10_000, timeout: 120_000 },
  );
}

// Revenue per cohort and month gap (Table D), oldest cohort first.
export async function getCohortLtvRows(
  brandId: string,
  startMonth: Date,
  endMonth: Date,
): Promise<CohortLtvRow[]> {
  const rows = await prisma.cohortLtv.findMany({
    where: { brandId, acquisitionCohort: { gte: startMonth, lte: endMonth } },
    orderBy: [{ acquisitionCohort: "asc" }, { monthGap: "asc" }],
  });

  return rows.map((row) => ({
    cohortMonth: row.acquisitionCohort,
    monthGap: row.monthGap,
    totalRevenue: row.totalRevenue.toNumber(),
  }));
}

// The most recent month the brand has any revenue in (Table C), or null if there is no data.
export async function getLatestTransactionMonth(brandId: string): Promise<Date | null> {
  const result = await prisma.customerMonthlyRevenue.aggregate({
    where: { brandId },
    _max: { transactionMonth: true },
  });
  return result._max.transactionMonth;
}
