import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it, mock } from "node:test";

import createApp from "./app.ts";
import type { Database } from "./db/db.ts";
import { createFakeAuth } from "./features/auth/auth.fake.ts";
import { CSRF_COOKIE } from "./middleware/require-csrf.ts";

const execute = mock.fn(async () => []);
const db = { execute } as unknown as Database;

const auth = createFakeAuth().options;

describe("health endpoints", () => {
  let server: Server;
  let baseUrl: string;

  before(() => {
    server = createApp({ db, auth }).listen(0);
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
    it("returns an ok status", async () => {
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

describe("API contract", () => {
  let server: Server;
  let baseUrl: string;

  before(() => {
    server = createApp({ db, auth }).listen(0);
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  });

  after(() => {
    server.close();
  });

  it("rejects a query parameter the spec doesn't declare", async () => {
    const res = await fetch(`${baseUrl}/api/health?unexpected=1`);

    assert.equal(res.status, 400);
    assert.equal(res.headers.get("content-type"), "application/problem+json; charset=utf-8");
    const body = (await res.json()) as { title: string; status: number };
    assert.equal(body.title, "Bad Request");
    assert.equal(body.status, 400);
  });

  it("sets the security headers on a response the validator rejects", async () => {
    const res = await fetch(`${baseUrl}/api/not-a-route`);

    assert.equal(res.status, 404);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("referrer-policy"), "no-referrer");
    assert.equal(
      res.headers.get("content-security-policy"),
      "default-src 'none'; frame-ancestors 'none'",
    );
    assert.equal(res.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.equal(res.headers.get("x-powered-by"), null);
  });

  it("returns 404 for a route the spec doesn't describe", async () => {
    const res = await fetch(`${baseUrl}/api/not-a-route`);

    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), {
      title: "Not Found",
      status: 404,
      detail: "not found",
    });
  });

  it("rejects a state-changing request without a CSRF token", async () => {
    const res = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", redirect: "manual" });

    assert.equal(res.status, 403);
    assert.equal(res.headers.get("content-type"), "application/problem+json; charset=utf-8");
    assert.deepEqual(await res.json(), {
      title: "Forbidden",
      status: 403,
      detail: "Invalid CSRF token",
    });
  });

  it("lets a state-changing request through with a matching CSRF token", async () => {
    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      redirect: "manual",
      headers: { cookie: `${CSRF_COOKIE}=the-token`, "x-csrf-token": "the-token" },
    });

    assert.equal(res.status, 302);
  });

  it("returns 405 for a method the spec doesn't describe", async () => {
    const res = await fetch(`${baseUrl}/api/health`, { method: "POST" });

    assert.equal(res.status, 405);
    const body = (await res.json()) as { title: string };
    assert.equal(body.title, "Method Not Allowed");
  });
});
