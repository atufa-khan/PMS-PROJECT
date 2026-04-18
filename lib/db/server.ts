import "server-only";

import { Client, Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "@/lib/config/env";

declare global {
  var __pmsPool: Pool | undefined;
  var __pmsDbUnavailableUntil: number | undefined;
}

type RetryableDbError = Error & {
  code?: string;
  errno?: number;
  syscall?: string;
};

function getConnectionString() {
  return env.DATABASE_URL ?? env.DIRECT_URL;
}

function getPgConnectionConfig() {
  const connectionString = getConnectionString();

  if (!connectionString) {
    return null;
  }

  return {
    connectionString,
    ssl: {
      rejectUnauthorized: false
    },
    connectionTimeoutMillis: 5_000,
    keepAlive: true
  } as const;
}

function createPool() {
  const config = getPgConnectionConfig();

  if (!config) {
    return null;
  }

  const pool = new Pool({
    ...config,
    max: 10,
    min: 0,
    idleTimeoutMillis: 60_000,
    maxLifetimeSeconds: 300
  });

  pool.on("error", (error) => {
    console.error("Postgres pool error:", error.message);
  });

  return pool;
}

function isRetryableConnectionError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const dbError = error as RetryableDbError;
  const message = error.message.toLowerCase();

  return (
    [
      "ECONNRESET",
      "EPIPE",
      "ETIMEDOUT",
      "ECONNREFUSED",
      "57P01",
      "57P02",
      "57P03"
    ].includes(dbError.code ?? "") ||
    message.includes("connection timeout") ||
    message.includes("connection terminated") ||
    message.includes("timeout expired") ||
    message.includes("timeout exceeded when trying to connect")
  );
}

export function isExpectedTransientDbError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message === "Database temporarily unavailable." ||
    isRetryableConnectionError(error)
  );
}

export async function resetDbPool() {
  const existingPool = globalThis.__pmsPool;

  if (!existingPool) {
    return;
  }

  globalThis.__pmsPool = undefined;

  try {
    await existingPool.end();
  } catch (error) {
    console.error("Failed to close Postgres pool cleanly:", error);
  }
}

function markDbTemporarilyUnavailable(durationMs = 15_000) {
  globalThis.__pmsDbUnavailableUntil = Date.now() + durationMs;
}

function clearDbUnavailableMarker() {
  globalThis.__pmsDbUnavailableUntil = undefined;
}

function isDbTemporarilyUnavailable() {
  return Boolean(
    globalThis.__pmsDbUnavailableUntil &&
      globalThis.__pmsDbUnavailableUntil > Date.now()
  );
}

export function isDbUnavailableFast() {
  return isDbTemporarilyUnavailable();
}

export function getDbPool() {
  if (!globalThis.__pmsPool) {
    const pool = createPool();

    if (!pool) {
      return null;
    }

    globalThis.__pmsPool = pool;
  }

  return globalThis.__pmsPool;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runFallbackOperation<T>(fallbackOperation?: () => Promise<T>) {
  if (!fallbackOperation) {
    return { used: false as const };
  }

  console.warn("Falling back to a standalone database client.");
  const result = await fallbackOperation();
  clearDbUnavailableMarker();
  return {
    used: true as const,
    result
  };
}

async function withStandaloneClient<T>(
  operation: (client: Client) => Promise<T>
): Promise<T> {
  const config = getPgConnectionConfig();

  if (!config) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = new Client(config);

  await client.connect();

  try {
    return await operation(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function withPoolRetry<T>(
  operation: (pool: Pool) => Promise<T>,
  fallbackOperation?: () => Promise<T>
): Promise<T> {
  let lastError: unknown;
  const poolAttempts = 2;

  if (isDbTemporarilyUnavailable()) {
    try {
      const fallbackResult = await runFallbackOperation(fallbackOperation);

      if (fallbackResult.used) {
        return fallbackResult.result;
      }
    } catch (error) {
      lastError = error;

      if (!isRetryableConnectionError(error)) {
        throw error;
      }
    }
  }

  for (let attempt = 0; attempt < poolAttempts; attempt += 1) {
    const pool = getDbPool();

    if (!pool) {
      throw new Error("DATABASE_URL is not configured.");
    }

    try {
      const result = await operation(pool);
      clearDbUnavailableMarker();
      return result;
    } catch (error) {
      lastError = error;

      if (!isRetryableConnectionError(error)) {
        throw error;
      }

      markDbTemporarilyUnavailable();
      console.warn(
        `Retrying database operation after connection failure (attempt ${attempt + 1}/${poolAttempts}).`
      );
      await resetDbPool();
      await sleep(250 * (attempt + 1));
    }
  }

  try {
    const fallbackResult = await runFallbackOperation(fallbackOperation);

    if (fallbackResult.used) {
      return fallbackResult.result;
    }
  } catch (error) {
    lastError = error;

    if (!isRetryableConnectionError(error)) {
      throw error;
    }

    markDbTemporarilyUnavailable();
  }

  if (isDbTemporarilyUnavailable()) {
    throw new Error("Database temporarily unavailable.");
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Database operation failed.");
}

export async function dbQuery<T extends QueryResultRow>(
  text: string,
  params: unknown[] = []
) {
  return withPoolRetry(
    (pool) => pool.query<T>(text, params),
    () => withStandaloneClient((client) => client.query<T>(text, params))
  );
}

async function runTransaction<T>(
  pool: Pool,
  callback: (client: PoolClient) => Promise<T>
) {
  let client: PoolClient | null = null;
  let shouldDestroyClient = false;

  try {
    client = await pool.connect();
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    shouldDestroyClient = true;

    if (client) {
      try {
        await client.query("rollback");
      } catch (rollbackError) {
        console.error("Transaction rollback failed:", rollbackError);
      }
    }

    throw error;
  } finally {
    if (client) {
      client.release(shouldDestroyClient ? new Error("Discard broken db client") : undefined);
    }
  }
}

export async function withDbTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
) {
  return withPoolRetry(
    (pool) => runTransaction(pool, callback),
    () =>
      withStandaloneClient(async (client) => {
        await client.query("begin");

        try {
          const result = await callback(client as unknown as PoolClient);
          await client.query("commit");
          return result;
        } catch (error) {
          try {
            await client.query("rollback");
          } catch (rollbackError) {
            console.error("Standalone transaction rollback failed:", rollbackError);
          }

          throw error;
        }
      })
  );
}
