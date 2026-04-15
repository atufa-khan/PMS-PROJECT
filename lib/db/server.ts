import "server-only";

import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "@/lib/config/env";

declare global {
  var __pmsPool: Pool | undefined;
}

function createPool() {
  const connectionString = env.DATABASE_URL ?? env.DIRECT_URL;

  if (!connectionString) {
    return null;
  }

  return new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    },
    max: 10
  });
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

export async function dbQuery<T extends QueryResultRow>(
  text: string,
  params: unknown[] = []
) {
  const pool = getDbPool();

  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return pool.query<T>(text, params);
}

export async function withDbTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
) {
  const pool = getDbPool();

  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = await pool.connect();

  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
