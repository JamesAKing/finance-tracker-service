import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import createApp from "./app.ts";
import { createDb } from "./db/db.ts";
import { createFakeAuth } from "./features/auth/auth.fake.ts";

// Only the database is needed here, so read DATABASE_URL directly rather than loading the full app config
const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "DATABASE_URL must be set to run integration tests");

const db = createDb(databaseUrl);

// A client pointed at a port where nothing is listening
const unreachableDb = createDb("postgres://postgres:password@localhost:1/none");

// These tests only touch health routes, so auth gets a stand-in that never talks to Keycloak
const auth = createFakeAuth().options;

function listen(server: Server) {
  const { port } = server.address() as AddressInfo;
  return `http://localhost:${port}`;
}

describe("GET /api/health/ready (real database)", () => {
  let healthyServer: Server;
  let brokenServer: Server;

  before(() => {
    healthyServer = createApp({ db, auth }).listen(0);
    brokenServer = createApp({ db: unreachableDb, auth }).listen(0);
  });

  after(async () => {
    healthyServer.close();
    brokenServer.close();
    await db.$client.end();
    await unreachableDb.$client.end();
  });

  it("returns 200 when Postgres is reachable", async () => {
    const res = await fetch(`${listen(healthyServer)}/api/health/ready`);

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ready" });
  });

  it("returns 503 when Postgres is unreachable", async () => {
    const res = await fetch(`${listen(brokenServer)}/api/health/ready`);

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { status: "unavailable" });
  });
});
