import app from "./app.ts";
import { verifyConnection } from "./db/db.ts";

const port = Number(process.env.PORT) || 3000;

try {
  await verifyConnection();
} catch (error) {
  console.error(error);
  process.exit(1);
}

app.listen(port, () => {
  console.log(`Service listening on http://localhost:${port}`);
});
