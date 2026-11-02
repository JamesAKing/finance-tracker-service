import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";

import cookieParser from "cookie-parser";
import express from "express";

import { sendProblem } from "../../api-contract.ts";
import { ACTIVE_SESSION_TOKEN, createFakeAuth, FAKE_LOGIN } from "./auth.fake.ts";
import type { AuthFlow } from "./oidc.ts";
import { AUTH_FLOW_COOKIE, createAuthRouter, SESSION_COOKIE } from "./routes.ts";

const fake = createFakeAuth();
const { callbackUrl, webOrigin } = fake.options;

let server: Server;
let baseUrl: string;

before(() => {
  const app = express();
  app.use(cookieParser());
  app.use("/api/auth", createAuthRouter(fake.options));
  app.use(sendProblem);
  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
});

after(() => {
  server.close();
});

function getLogin() {
  return fetch(`${baseUrl}/api/auth/login`, { redirect: "manual" });
}

function findSetCookie(res: Response, name: string) {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
}

function readFlowCookie(res: Response) {
  const header = findSetCookie(res, AUTH_FLOW_COOKIE);
  assert.ok(header, "auth_flow cookie was not set");

  const [pair = "", ...attributes] = header.split("; ");
  const value = decodeURIComponent(pair.slice(AUTH_FLOW_COOKIE.length + 1));
  return { pair, flow: JSON.parse(value) as AuthFlow, attributes };
}

describe("GET /api/auth/login", () => {
  it("redirects to the issuer's authorization endpoint", async () => {
    const res = await getLogin();

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
    const { attributes } = readFlowCookie(await getLogin());

    assert.ok(attributes.includes("HttpOnly"));
    assert.ok(attributes.includes("Secure"));
    assert.ok(attributes.includes("SameSite=Lax"));
    assert.ok(attributes.includes("Path=/api/auth/callback"));
    assert.ok(attributes.includes("Max-Age=600"));
  });

  it("stores the values the callback needs to verify the redirect", async () => {
    const res = await getLogin();
    const params = new URL(res.headers.get("location") ?? "").searchParams;
    const { flow } = readFlowCookie(res);

    assert.equal(params.get("state"), flow.state);
    assert.equal(params.get("nonce"), flow.nonce);
    const expectedChallenge = createHash("sha256").update(flow.codeVerifier).digest("base64url");
    assert.equal(params.get("code_challenge"), expectedChallenge);
  });

  it("generates fresh values for every login", async () => {
    const first = readFlowCookie(await getLogin()).flow;
    const second = readFlowCookie(await getLogin()).flow;

    assert.notEqual(first.state, second.state);
    assert.notEqual(first.nonce, second.nonce);
    assert.notEqual(first.codeVerifier, second.codeVerifier);
  });
});

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    for (const fn of [fake.exchangeCode, fake.upsertUser, fake.createSession, fake.deleteSession]) {
      fn.mock.resetCalls();
    }
    mock.method(console, "error", () => {});
  });

  afterEach(() => {
    mock.restoreAll();
  });

  async function getCallback({ cookies = [] as string[], withFlow = true } = {}) {
    const { pair, flow } = readFlowCookie(await getLogin());
    const cookieHeader = [...(withFlow ? [pair] : []), ...cookies].join("; ");

    const res = await fetch(`${baseUrl}/api/auth/callback?code=the-code&state=${flow.state}`, {
      redirect: "manual",
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    });
    return { res, flow };
  }

  it("exchanges the code using the stored flow values and the configured callback URL", async () => {
    const { flow } = await getCallback();

    assert.equal(fake.exchangeCode.mock.callCount(), 1);
    const [currentUrl, passedFlow] = fake.exchangeCode.mock.calls[0]?.arguments ?? [];
    assert.equal(currentUrl?.href, `${callbackUrl}?code=the-code&state=${flow.state}`);
    assert.deepEqual(passedFlow, flow);
  });

  it("upserts the user and creates a session for them", async () => {
    await getCallback();

    assert.deepEqual(fake.upsertUser.mock.calls[0]?.arguments, [FAKE_LOGIN.identity]);
    assert.deepEqual(fake.createSession.mock.calls[0]?.arguments, [
      {
        userId: "user-1",
        authSessionId: FAKE_LOGIN.authSessionId,
        idToken: FAKE_LOGIN.idToken,
      },
    ]);
  });

  it("sets the session cookie and redirects to the app", async () => {
    const { res } = await getCallback();

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), `${webOrigin}/`);

    const header = findSetCookie(res, SESSION_COOKIE);
    assert.ok(header, "session cookie was not set");
    const [pair, ...attributes] = header.split("; ");
    assert.equal(pair, `${SESSION_COOKIE}=new-session-token`);
    assert.ok(attributes.includes("HttpOnly"));
    assert.ok(attributes.includes("Secure"));
    assert.ok(attributes.includes("SameSite=Lax"));
    assert.ok(attributes.includes("Path=/"));
    assert.ok(attributes.some((a) => a.startsWith("Expires=")));
  });

  it("clears the flow cookie so it can't be replayed", async () => {
    const { res } = await getCallback();

    const header = findSetCookie(res, AUTH_FLOW_COOKIE);
    assert.ok(header?.includes("Expires=Thu, 01 Jan 1970"));
    assert.ok(header?.includes("Path=/api/auth/callback"));
  });

  it("deletes the session the browser arrived with (session fixation)", async () => {
    await getCallback({ cookies: [`${SESSION_COOKIE}=old-session-token`] });

    assert.deepEqual(fake.deleteSession.mock.calls[0]?.arguments, ["old-session-token"]);
    assert.equal(fake.createSession.mock.callCount(), 1);
  });

  it("fails without a flow cookie and never calls Keycloak", async () => {
    const { res } = await getCallback({ withFlow: false });

    assert.equal(res.headers.get("location"), `${webOrigin}/?login=failed`);
    assert.equal(fake.exchangeCode.mock.callCount(), 0);
    assert.equal(findSetCookie(res, SESSION_COOKIE), undefined);
  });

  it("fails without creating a session when the code exchange is rejected", async () => {
    fake.exchangeCode.mock.mockImplementationOnce(async () => {
      throw new Error("state mismatch");
    });

    const { res } = await getCallback();

    assert.equal(res.headers.get("location"), `${webOrigin}/?login=failed`);
    assert.equal(fake.upsertUser.mock.callCount(), 0);
    assert.equal(fake.createSession.mock.callCount(), 0);
    assert.equal(findSetCookie(res, SESSION_COOKIE), undefined);
  });
});

describe("GET /api/auth/me", () => {
  function getMe(cookie?: string) {
    return fetch(`${baseUrl}/api/auth/me`, cookie ? { headers: { cookie } } : {});
  }

  it("returns the signed-in user's email and nothing else", async () => {
    const res = await getMe(`${SESSION_COOKIE}=${ACTIVE_SESSION_TOKEN}`);

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { email: FAKE_LOGIN.identity.email });
    assert.equal(res.headers.get("cache-control"), "no-store");
  });

  for (const [name, cookie] of [
    ["without a session cookie", undefined],
    ["with an unknown or expired session", `${SESSION_COOKIE}=not-a-real-token`],
  ] as const) {
    it(`returns a generic 401 ${name}`, async () => {
      const res = await getMe(cookie);

      assert.equal(res.status, 401);
      assert.equal(res.headers.get("content-type"), "application/problem+json; charset=utf-8");
      assert.deepEqual(await res.json(), {
        title: "Unauthorized",
        status: 401,
        detail: "Not authenticated",
      });
    });
  }
});

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    fake.endSession.mock.resetCalls();
  });

  function postLogout(cookie?: string) {
    return fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      redirect: "manual",
      ...(cookie && { headers: { cookie } }),
    });
  }

  function assertSessionCookieCleared(res: Response) {
    const header = findSetCookie(res, SESSION_COOKIE);
    assert.ok(header, "session cookie was not cleared");
    assert.match(header, /^__Host-session=;/);
    assert.match(header, /Path=\/;/);
    assert.match(header, /Expires=Thu, 01 Jan 1970/);
    assert.match(header, /HttpOnly/);
    assert.match(header, /Secure/);
  }

  it("ends the session and sends the browser through Keycloak to sign out there too", async () => {
    const res = await postLogout(`${SESSION_COOKIE}=${ACTIVE_SESSION_TOKEN}`);

    assert.equal(res.status, 302);
    const location = new URL(res.headers.get("location") ?? "");
    assert.equal(
      location.origin + location.pathname,
      "https://idp.example.test/realms/test/logout",
    );
    assert.equal(location.searchParams.get("id_token_hint"), FAKE_LOGIN.idToken);
    assert.ok(location.searchParams.get("post_logout_redirect_uri")?.startsWith(webOrigin));
    assert.deepEqual(
      fake.endSession.mock.calls.map((call) => call.arguments),
      [[ACTIVE_SESSION_TOKEN]],
    );
    assertSessionCookieCleared(res);
  });

  it("goes straight back to the app when the session is unknown or has expired", async () => {
    const res = await postLogout(`${SESSION_COOKIE}=not-a-real-token`);

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), new URL("/", webOrigin).href);
    assert.equal(fake.endSession.mock.callCount(), 1);
    assertSessionCookieCleared(res);
  });

  it("goes straight back to the app, without touching the database, when there is no cookie", async () => {
    const res = await postLogout();

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), new URL("/", webOrigin).href);
    assert.equal(fake.endSession.mock.callCount(), 0);
    assertSessionCookieCleared(res);
  });
});
