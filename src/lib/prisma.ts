import { env } from "../config/env";
import { PrismaClient } from "../generated/prisma/client";

// One shared client for the whole app so we reuse a single connection pool.
export const prisma = new PrismaClient({ datasourceUrl: env.databaseUrl });
