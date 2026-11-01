import cookieParser from "cookie-parser";
import { sql } from "drizzle-orm";
import express from "express";
import { enforceApiContract, sendProblem } from "./api-contract.ts";
import type { Database } from "./db/db.ts";
import { type AuthRouterOptions, createAuthRouter } from "./features/auth/routes.ts";
import { setSecureHeaders } from "./security-headers.ts";

type CreateAppOptions = {
  db: Database;
  auth: AuthRouterOptions;
};

export default function createApp({ db, auth }: CreateAppOptions) {
  const app = express();

  app.disable("x-powered-by");

  app.use(setSecureHeaders);
  app.use(cookieParser());
  app.use(enforceApiContract());

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

  app.use(sendProblem);

  return app;
}
