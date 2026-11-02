import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it, mock } from "node:test";

import express from "express";

import { enforceApiContract, HttpError, problemHandlers } from "./api-contract.ts";

const spec = {
  openapi: "3.0.3",
  info: { title: "Test", version: "1.0.0" },
  servers: [{ url: "/api" }],
  paths: {
    "/thing": {
      get: {
        responses: {
          "200": {
            description: "A thing",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["name"],
                  properties: { name: { type: "string" } },
                },
              },
            },
          },
          "404": {
            description: "No thing",
            content: {
              "application/problem+json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "status"],
                  properties: {
                    title: { type: "string" },
                    status: { type: "integer" },
                    detail: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

describe("enforceApiContract", () => {
  let server: Server;
  let baseUrl: string;
  const handler = mock.fn(
    (_req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.json({ name: "ok" });
    },
  );

  before(() => {
    const app = express();
    app.use(enforceApiContract(spec));
    app.get("/api/thing", handler);
    app.use(problemHandlers);
    server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  });

  after(() => {
    server.close();
  });

  it("lets a response that matches the spec through", async () => {
    const res = await fetch(`${baseUrl}/api/thing`);

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { name: "ok" });
  });

  it("turns a response that breaks the spec into a 500 without the details", async (t) => {
    t.mock.method(console, "error", () => {});
    handler.mock.mockImplementationOnce((_req, res) => {
      res.json({ name: "ok", passwordHash: "leaked" });
    });

    const res = await fetch(`${baseUrl}/api/thing`);

    assert.equal(res.status, 500);
    assert.equal(res.headers.get("content-type"), "application/problem+json; charset=utf-8");
    assert.deepEqual(await res.json(), { title: "Internal Server Error", status: 500 });
  });

  it("sends an error status the spec declares as a Problem", async () => {
    handler.mock.mockImplementationOnce((_req, _res, next) => {
      next(new HttpError(404, "No such thing"));
    });

    const res = await fetch(`${baseUrl}/api/thing`);

    assert.equal(res.status, 404);
    assert.equal(res.headers.get("content-type"), "application/problem+json; charset=utf-8");
    assert.deepEqual(await res.json(), {
      title: "Not Found",
      status: 404,
      detail: "No such thing",
    });
  });

  it("turns an error status the spec doesn't declare into a 500 Problem", async (t) => {
    t.mock.method(console, "error", () => {});
    handler.mock.mockImplementationOnce((_req, _res, next) => {
      next(new HttpError(403, "Not declared"));
    });

    const res = await fetch(`${baseUrl}/api/thing`);

    assert.equal(res.status, 500);
    assert.equal(res.headers.get("content-type"), "application/problem+json; charset=utf-8");
    assert.deepEqual(await res.json(), { title: "Internal Server Error", status: 500 });
  });

  it("returns a bare 500 when a handler throws, without the error's message", async (t) => {
    t.mock.method(console, "error", () => {});
    handler.mock.mockImplementationOnce(() => {
      throw new Error("secret internals");
    });

    const res = await fetch(`${baseUrl}/api/thing`);

    assert.equal(res.status, 500);
    const text = await res.text();
    assert.doesNotMatch(text, /secret/);
    assert.deepEqual(JSON.parse(text), { title: "Internal Server Error", status: 500 });
  });
});
