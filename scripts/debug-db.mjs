import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";
import dns from "node:dns/promises";
import { Client } from "pg";

async function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");

  try {
    const contents = await fs.readFile(envPath, "utf8");
    const entries = {};

    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^"(.*)"$/, "$1");
      entries[key] = value;
    }

    return entries;
  } catch {
    return {};
  }
}

function getEnvValue(key, fileEnv) {
  const runtimeValue = process.env[key];
  if (typeof runtimeValue === "string" && runtimeValue.trim()) {
    return runtimeValue.trim();
  }

  const fileValue = fileEnv[key];
  return typeof fileValue === "string" ? fileValue.trim() : "";
}

function maskConnectionString(connectionString) {
  if (!connectionString) return "(missing)";

  try {
    const url = new URL(connectionString);
    if (url.password) {
      url.password = "********";
    }
    return url.toString();
  } catch {
    return "(invalid URL)";
  }
}

function getConnectionWarnings(parsed, label) {
  const warnings = [];

  if (label === "DIRECT_URL probe" && parsed.hostname.includes("pooler.supabase.com")) {
    warnings.push("DIRECT_URL is using the pooler host. Direct migrations should usually use db.<project-ref>.supabase.co.");
  }

  if (label === "DATABASE_URL probe" && !parsed.searchParams.has("pgbouncer")) {
    warnings.push("DATABASE_URL does not include ?pgbouncer=true. Supabase pooler connections usually expect it.");
  }

  if (label === "DIRECT_URL probe" && parsed.username.includes(".")) {
    warnings.push("DIRECT_URL username looks pooler-scoped. Direct connections usually use plain postgres as the username.");
  }

  return warnings;
}

async function probeConnection(label, connectionString) {
  console.log(`\n== ${label} ==`);
  console.log("Connection:", maskConnectionString(connectionString));

  if (!connectionString) {
    console.log("Missing.");
    return;
  }

  try {
    const parsed = new URL(connectionString);
    const host = parsed.hostname;
    const port = parsed.port || "(default)";
    console.log("Host:", host);
    console.log("Port:", port);
    console.log("User:", parsed.username);
    console.log("Params:", parsed.search || "(none)");

    const warnings = getConnectionWarnings(parsed, label);
    if (warnings.length > 0) {
      console.log("Warnings:");
      for (const warning of warnings) {
        console.log(`- ${warning}`);
      }
    }

    try {
      const lookup = await dns.lookup(host, { all: true });
      console.log("DNS:", lookup);
    } catch (error) {
      console.error("DNS lookup failed:", error);
    }

    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000
    });

    try {
      await client.connect();
      const result = await client.query("select current_database() as db, current_user as user, now() as now");
      console.log("Connected successfully:", result.rows[0]);
    } finally {
      await client.end().catch(() => {});
    }
  } catch (error) {
    console.error("Connection failed:", error);
  }
}

async function main() {
  const fileEnv = await loadDotEnvLocal();
  const databaseUrl = getEnvValue("DATABASE_URL", fileEnv);
  const directUrl = getEnvValue("DIRECT_URL", fileEnv);

  await probeConnection("DATABASE_URL probe", databaseUrl);
  await probeConnection("DIRECT_URL probe", directUrl);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
