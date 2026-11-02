import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import { relations } from "./relations.ts";

// Nothing connects on import; the pool is created when this is called
export function createDb(url: string) {
  return drizzle(url, {
    relations,
  });
}

export type Database = ReturnType<typeof createDb>;

export async function verifyConnection(db: Database, url: string) {
  const { hostname, port, pathname } = new URL(url);
  const target = `${hostname}:${port || 5432}/${pathname.slice(1)}`;

  try {
    await db.execute(sql`SELECT 1`);
  } catch (error) {
    throw new Error(`Could not connect to database at ${target}`, {
      cause: error,
    });
  }
  console.log(`Database connected at ${target}`);
}
