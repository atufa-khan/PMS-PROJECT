import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

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
      return { client, label: candidate.label };
    } catch (error) {
      lastError = error;
      console.error(`Failed using ${candidate.label}:`, error.message);
      await client.end().catch(() => {});
    }
  }

  throw lastError ?? new Error("No database connection string available.");
}

async function main() {
  const directUrl = process.env.DIRECT_URL;
  const databaseUrl = process.env.DATABASE_URL;

  if (!directUrl && !databaseUrl) {
    throw new Error("DIRECT_URL or DATABASE_URL must be set.");
  }

  const root = process.cwd();
  const migrationPath = path.join(
    root,
    "supabase",
    "migrations",
    "0001_initial_schema.sql"
  );
  const seedPath = path.join(root, "supabase", "seed.sql");

  const [migrationSql, seedSql] = await Promise.all([
    fs.readFile(migrationPath, "utf8"),
    fs.readFile(seedPath, "utf8")
  ]);

  const { client, label } = await connectWithFallback([
    { label: "DIRECT_URL", value: directUrl },
    { label: "DATABASE_URL", value: databaseUrl }
  ]);

  try {
    console.log(`Applying migration via ${label}...`);
    await client.query(migrationSql);
    console.log("Migration applied.");

    console.log(`Applying seed via ${label}...`);
    await client.query(seedSql);
    console.log("Seed applied.");

    const result = await client.query(
      `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('profiles', 'goals', 'probation_cases', 'flags', 'app_settings')
      order by table_name
      `
    );

    console.log("Applied migration and seed successfully.");
    console.log(
      "Verified tables:",
      result.rows.map((row) => row.table_name).join(", ")
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
