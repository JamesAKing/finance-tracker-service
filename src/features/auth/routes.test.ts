import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express from "express";
import * as client from "openid-client";
import { AUTH_FLOW_COOKIE, type AuthFlow, createAuthRouter } from "./routes.ts";

const oidc = new client.Configuration(
  {
    issuer: "https://idp.example.test/realms/test",
    authorization_endpoint: "https://idp.example.test/realms/test/auth",
  },
  "test-client",
  "test-secret",
);
const callbackUrl = "http://localhost:5173/api/auth/callback";

function getLogin(baseUrl: string) {
  return fetch(`${baseUrl}/api/auth/login`, { redirect: "manual" });
}

function readFlowCookie(res: Response) {
  const header = res.headers.getSetCookie().find((c) => c.startsWith(`${AUTH_FLOW_COOKIE}=`));
  assert.ok(header, "auth_flow cookie was not set");

  const [pair = "", ...attributes] = header.split("; ");
  const value = decodeURIComponent(pair.slice(AUTH_FLOW_COOKIE.length + 1));
  return { flow: JSON.parse(value) as AuthFlow, attributes };
}

describe("GET /api/auth/login", () => {
  let server: Server;
  let baseUrl: string;

  before(() => {
    const app = express();
    app.use("/api/auth", createAuthRouter({ oidc, callbackUrl }));
    server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  });

  after(() => {
    server.close();
  });

  it("redirects to the issuer's authorization endpoint", async () => {
    const res = await getLogin(baseUrl);

    assert.equal(res.status, 302);
    const location = new URL(res.headers.get("location") ?? "");
    assert.equal(location.origin + location.pathname, "https://idp.example.test/realms/test/auth");

    const params = location.searchParams;
    assert.equal(params.get("client_id"), "test-client");
    assert.equal(params.get("response_type"), "code");
    assert.equal(params.get("redirect_uri"), callbackUrl);
    assert.equal(params.get("scope"), "openid email");
    assert.equal(params.get("code_challenge_method"), "S256");
  });

  it("sets a short-lived, HttpOnly flow cookie scoped to the callback", async () => {
    const { attributes } = readFlowCookie(await getLogin(baseUrl));

    assert.ok(attributes.includes("HttpOnly"));
    assert.ok(attributes.includes("Secure"));
    assert.ok(attributes.includes("SameSite=Lax"));
    assert.ok(attributes.includes("Path=/api/auth/callback"));
    assert.ok(attributes.includes("Max-Age=600"));
  });

  it("stores the values the callback needs to verify the redirect", async () => {
    const res = await getLogin(baseUrl);
    const params = new URL(res.headers.get("location") ?? "").searchParams;
    const { flow } = readFlowCookie(res);

    assert.equal(params.get("state"), flow.state);
    assert.equal(params.get("nonce"), flow.nonce);
    // The challenge sent to Keycloak is the S256 hash of the verifier kept in the cookie
    const expectedChallenge = createHash("sha256").update(flow.codeVerifier).digest("base64url");
    assert.equal(params.get("code_challenge"), expectedChallenge);
  });

  it("generates fresh values for every login", async () => {
    const first = readFlowCookie(await getLogin(baseUrl)).flow;
    const second = readFlowCookie(await getLogin(baseUrl)).flow;

    assert.notEqual(first.state, second.state);
    assert.notEqual(first.nonce, second.nonce);
    assert.notEqual(first.codeVerifier, second.codeVerifier);
  });
});
