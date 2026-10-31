import { sql } from "drizzle-orm";
import express from "express";
import type { Database } from "./db/db.ts";

export default function createApp({ db }: { db: Database }) {
  const app = express();

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/health/ready", async (_req, res) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.status(200).json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });

  return app;
}
