import "dotenv/config";
import path from "node:path";

// The only place in src/ that reads process.env. Everything else imports `env`.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function readPort(): number {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) throw new Error("PORT must be a positive integer");
  return port;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  port: readPort(),
  // Folder containing brands.json and the brand_XX.ndjson files
  dataDir: path.resolve(process.env.DATA_DIR ?? "data"),
};
