import express from "express";

export default function createApp() {
  const app = express();

  app.get("/api/health", (_req, res) => {
    res.json({ message: "Hello World" });
  });

  return app;
}
