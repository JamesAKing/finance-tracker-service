import express from "express";

const app = express();

app.get("/api/health", (_req, res) => {
  res.json({ message: "Hello World" });
});

export default app;
