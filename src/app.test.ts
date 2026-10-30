import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import type { Server } from "node:http";
import app from "./app.ts";

describe("GET /api/health", () => {
  let server: Server;
  let baseUrl: string;

  before(() => {
    server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  });

  after(() => {
    server.close();
  });

  test("returns Hello World", async () => {
    const res = await fetch(`${baseUrl}/api/health`);

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { message: "Hello World" });
  });
});
