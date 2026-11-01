import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it, mock } from "node:test";
import express from "express";
import { enforceApiContract, sendProblem } from "./api-contract.ts";

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
        },
      },
    },
  },
} as const;

describe("enforceApiContract", () => {
  let server: Server;
  let baseUrl: string;
  const handler = mock.fn((_req: express.Request, res: express.Response) => {
    res.json({ name: "ok" });
  });

  before(() => {
    const app = express();
    app.use(enforceApiContract(spec));
    app.get("/api/thing", handler);
    app.use(sendProblem);
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
});
