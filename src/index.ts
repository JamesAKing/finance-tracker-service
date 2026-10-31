import createApp from "./app.ts";
import { db, verifyConnection } from "./db/db.ts";

const port = Number(process.env.PORT) || 3000;

try {
  await verifyConnection();
} catch (error) {
  console.error(error);
  process.exit(1);
}

const app = createApp({
  db,
});

const server = app.listen(port, () => {
  console.log(`Listening on ${port}`);
});

let shuttingDown = false;

function shutdown(signal: "SIGINT" | "SIGTERM") {
  if (shuttingDown) return;

  shuttingDown = true;
  console.log(`${signal} received, shutting down`);

  setTimeout(() => {
    console.error("Forced exit after timeout");
    process.exit(1);
  }, 8000).unref();

  async function closeResources() {
    try {
      await db.$client.end();
      process.exit(0);
    } catch (error) {
      console.error("Error closing pool", error);
      process.exit(1);
    }
  }

  server.close(() => void closeResources());
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
