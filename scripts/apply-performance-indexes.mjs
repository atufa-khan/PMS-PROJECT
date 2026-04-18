import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

function parseEnvFile(content) {
  const entries = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries[key] = value;
  }

  return entries;
}

async function readLocalEnv(root) {
  try {
    const envContent = await fs.readFile(path.join(root, ".env.local"), "utf8");
    return parseEnvFile(envContent);
  } catch {
    return {};
  }
}

async function connectWithFallback(connectionStrings) {
  let lastError;

  for (const candidate of connectionStrings) {
    if (!candidate.value) {
      continue;
    }

    const client = new Client({
      connectionString: candidate.value,
      ssl: {
        rejectUnauthorized: false
      },
      connectionTimeoutMillis: 10000
    });

    try {
      console.log(`Trying ${candidate.label}...`);
      await client.connect();
      console.log(`Connected using ${candidate.label}.`);
      return client;
    } catch (error) {
      lastError = error;
      console.error(`Failed using ${candidate.label}:`, error.message);
      await client.end().catch(() => {});
    }
  }

  throw lastError ?? new Error("No database connection string available.");
}

async function main() {
  const root = process.cwd();
  const localEnv = await readLocalEnv(root);
  const directUrl = process.env.DIRECT_URL ?? localEnv.DIRECT_URL;
  const databaseUrl = process.env.DATABASE_URL ?? localEnv.DATABASE_URL;
  const migrationPath = path.join(
    root,
    "supabase",
    "migrations",
    "0002_performance_indexes.sql"
  );
  const sql = await fs.readFile(migrationPath, "utf8");
  const client = await connectWithFallback([
    { label: "DIRECT_URL", value: directUrl },
    { label: "DATABASE_URL", value: databaseUrl }
  ]);

  try {
    await client.query(sql);
    console.log("Performance indexes applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
