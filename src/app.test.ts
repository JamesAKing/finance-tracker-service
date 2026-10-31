import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import createApp from "./app.ts";
import type { Database } from "./db/db.ts";

const execute = mock.fn(async () => []);
const db = { execute } as unknown as Database;

describe("health endpoints", () => {
  let server: Server;
  let baseUrl: string;

  before(() => {
    server = createApp({ db }).listen(0);
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  });

  beforeEach(() => {
    execute.mock.resetCalls();
  });

  after(() => {
    server.close();
  });

  describe("GET /api/health", () => {
    it("returns an ok status without touching the database", async () => {
      const res = await fetch(`${baseUrl}/api/health`);

      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { status: "ok" });
      assert.equal(execute.mock.callCount(), 0);
    });
  });

  describe("GET /api/health/ready", () => {
    it("returns 200 when the database query succeeds", async () => {
      const res = await fetch(`${baseUrl}/api/health/ready`);

      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { status: "ready" });
      assert.equal(execute.mock.callCount(), 1);
    });

    it("returns 503 when the database query fails", async () => {
      execute.mock.mockImplementationOnce(async () => {
        throw new Error("connection refused");
      });

      const res = await fetch(`${baseUrl}/api/health/ready`);

      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { status: "unavailable" });
      assert.equal(execute.mock.callCount(), 1);
    });
  });
});
