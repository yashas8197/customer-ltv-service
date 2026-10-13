import { CohortQuery } from "../types/cohort";
import { isFirstOfMonth, parseDate } from "../utils/date";
import { AppError } from "../utils/errors";

function requireString(query: Record<string, unknown>, name: string): string {
  const value = query[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new AppError(`${name} is required`, 400);
  }
  return value.trim();
}

function requireMonth(query: Record<string, unknown>, name: string): Date {
  const value = requireString(query, name);

  const date = parseDate(value);
  if (!date) throw new AppError(`${name} must be a valid date in YYYY-MM-DD format`, 400);
  if (!isFirstOfMonth(date)) {
    throw new AppError(`${name} must be the first day of a month, e.g. 2025-01-01`, 400);
  }
  return date;
}

// Validates the query params of GET /api/v1/ltv-retention-cohort.
export function validateCohortQuery(query: Record<string, unknown>): CohortQuery {
  const brandId = requireString(query, "brandId");
  const startMonth = requireMonth(query, "startMonth");
  const endMonth = requireMonth(query, "endMonth");

  if (startMonth > endMonth) {
    throw new AppError("startMonth must not be after endMonth", 400);
  }

  return { brandId, startMonth, endMonth };
}
