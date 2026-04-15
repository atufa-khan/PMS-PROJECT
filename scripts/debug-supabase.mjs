import process from "node:process";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function maskSecret(value, visibleTail = 6) {
  if (!value) {
    return "(missing)";
  }

  if (value.length <= visibleTail) {
    return "*".repeat(value.length);
  }

  return `${"*".repeat(Math.max(8, value.length - visibleTail))}${value.slice(-visibleTail)}`;
}

async function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");

  try {
    const contents = await fs.readFile(envPath, "utf8");
    const entries = {};

    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();

      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^"(.*)"$/, "$1");
      entries[key] = value;
    }

    return entries;
  } catch {
    return {};
  }
}

function getEnvValue(key, fallbackEnv) {
  const runtimeValue = process.env[key];
  if (typeof runtimeValue === "string" && runtimeValue.trim()) {
    return runtimeValue.trim();
  }

  const fileValue = fallbackEnv[key];
  return typeof fileValue === "string" ? fileValue.trim() : "";
}

async function main() {
  const fileEnv = await loadDotEnvLocal();
  const supabaseUrl = getEnvValue("NEXT_PUBLIC_SUPABASE_URL", fileEnv);
  const publishableKey =
    getEnvValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", fileEnv) ||
    getEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", fileEnv);
  const databaseUrl = getEnvValue("DATABASE_URL", fileEnv);
  const directUrl = getEnvValue("DIRECT_URL", fileEnv);

  console.log("== Supabase env summary ==");
  console.log("NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl || "(missing)");
  console.log("Public key present:", Boolean(publishableKey));
  console.log("Public key preview:", maskSecret(publishableKey));
  console.log("DATABASE_URL present:", Boolean(databaseUrl));
  console.log("DIRECT_URL present:", Boolean(directUrl));

  if (!supabaseUrl || !publishableKey) {
    console.error("Missing Supabase public env values.");
    process.exit(1);
  }

  const projectHost = new URL(supabaseUrl).host;
  console.log("\n== DNS checks ==");
  console.log("Project host:", projectHost);
  console.log("Project ref:", projectHost.split(".")[0]);

  try {
    const projectDns = await dns.lookup(projectHost, { all: true });
    console.log("Project host lookup:", projectDns);
  } catch (error) {
    console.error("Project host lookup failed:", error);
  }

  if (databaseUrl) {
    try {
      const pooled = new URL(databaseUrl);
      const dbHostname = pooled.hostname;
      console.log("Database host:", dbHostname);
      console.log("Database port:", pooled.port || "(default)");
      console.log("Database user:", pooled.username);
      console.log("Database params:", pooled.search || "(none)");
      const dbDns = await dns.lookup(dbHostname, { all: true });
      console.log("Database host lookup:", dbDns);
    } catch (error) {
      console.error("Database host parse/lookup failed:", error);
    }
  }

  if (directUrl) {
    try {
      const direct = new URL(directUrl);
      console.log("Direct DB host:", direct.hostname);
      console.log("Direct DB port:", direct.port || "(default)");
      console.log("Direct DB user:", direct.username);
      console.log("Direct DB params:", direct.search || "(none)");
    } catch (error) {
      console.error("Direct URL parse failed:", error);
    }
  }

  console.log("\n== Supabase REST auth probe ==");
  const client = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    global: {
      fetch: async (input, init) => {
        const url = typeof input === "string" ? input : input.url;
        console.log(`fetch -> ${init?.method ?? "GET"} ${url}`);
        const response = await fetch(input, init);
        console.log(`fetch <- ${response.status} ${response.statusText} ${url}`);
        return response;
      }
    }
  });

  try {
    const { data, error } = await client.auth.getSession();
    console.log("auth.getSession() session present:", Boolean(data.session));
    if (error) {
      console.error("auth.getSession() error:", {
        message: error.message,
        status: error.status
      });
    } else {
      console.log("auth.getSession() completed without transport error.");
    }
  } catch (error) {
    console.error("Supabase client probe threw:", error);
  }

  console.log("\n== Supabase REST health probes ==");
  try {
    const authHealth = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: {
        apikey: publishableKey
      }
    });
    console.log("auth/v1/health:", authHealth.status, authHealth.statusText);
    const authHealthText = await authHealth.text();
    console.log("auth/v1/health body:", authHealthText.slice(0, 300));
  } catch (error) {
    console.error("auth/v1/health probe failed:", error);
  }

  try {
    const restProbe = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`
      }
    });
    console.log("rest/v1 root:", restProbe.status, restProbe.statusText);
    const restText = await restProbe.text();
    console.log("rest/v1 root body:", restText.slice(0, 300));
  } catch (error) {
    console.error("rest/v1 root probe failed:", error);
  }

  console.log("\n== Done ==");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
