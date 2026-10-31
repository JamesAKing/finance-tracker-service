import { sql } from "drizzle-orm";
import cookieParser from "cookie-parser";
import express from "express";
import type { Database } from "./db/db.ts";
import { type AuthRouterOptions, createAuthRouter } from "./features/auth/routes.ts";

type CreateAppOptions = {
  db: Database;
  auth: AuthRouterOptions;
};

export default function createApp({ db, auth }: CreateAppOptions) {
  const app = express();

  app.use(cookieParser());

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

  app.use("/api/auth", createAuthRouter(auth));

  return app;
}
