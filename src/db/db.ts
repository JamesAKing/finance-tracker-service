import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { relations } from "./relations.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set");
}

const { hostname, port, pathname } = new URL(url);
const target = `${hostname}:${port || 5432}/${pathname.slice(1)}`;

export async function verifyConnection() {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (error) {
    throw new Error(`Could not connect to database at ${target}`, {
      cause: error,
    });
  }
  console.log(`Database connected at ${target}`);
}

export const db = drizzle(url, {
  relations,
});
