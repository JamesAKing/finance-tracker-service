import createApp from "./app.ts";
import { type Config, loadConfig } from "./config.ts";
import { createDb, verifyConnection } from "./db/db.ts";

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

const db = createDb(config.databaseUrl);

try {
  await verifyConnection(db, config.databaseUrl);
} catch (error) {
  console.error(error);
  process.exit(1);
}

const app = createApp({
  db,
});

const server = app.listen(config.port, () => {
  console.log(`Listening on ${config.port}`);
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
