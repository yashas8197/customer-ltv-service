// Validated query params of GET /api/v1/ltv-retention-cohort
export type CohortQuery = {
  brandId: string;
  startMonth: Date;
  endMonth: Date;
};

// Revenue of a cohort in one month gap (from Table D)
export type CohortLtvRow = {
  cohortMonth: Date;
  monthGap: number;
  totalRevenue: number;
};

export type CohortGrid = {
  monthGaps: number[];
  cohorts: {
    cohortMonth: string;
    values: (number | null)[];
  }[];
};

export type RetentionCohortResponse = CohortGrid & {
  brandId: string;
  startMonth: string;
  endMonth: string;
  currency: string;
};
