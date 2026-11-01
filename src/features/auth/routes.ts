import express from "express";
import * as client from "openid-client";
import { z } from "zod";
import type { AuthFlow, CodeExchange, OidcClient } from "./oidc.ts";
import { createRequireAuth, currentUser, SESSION_COOKIE } from "./require-auth.ts";
import type { SessionRepository } from "./session-repository.ts";
import type { UserRepository } from "./user-repository.ts";

export const AUTH_FLOW_COOKIE = "auth_flow";
const AUTH_FLOW_MAX_AGE_MS = 10 * 60 * 1000;

export { SESSION_COOKIE };

const authFlowSchema = z.object({
  state: z.string(),
  nonce: z.string(),
  codeVerifier: z.string(),
}) satisfies z.ZodType<AuthFlow>;

export type AuthRouterOptions = {
  oidc: OidcClient;
  exchangeCode: CodeExchange;
  users: UserRepository;
  sessions: SessionRepository;
  callbackUrl: string;
  webOrigin: string;
};

function readAuthFlow(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    return authFlowSchema.parse(JSON.parse(value));
  } catch {
    return undefined;
  }
}

export function createAuthRouter({
  oidc,
  exchangeCode,
  users,
  sessions,
  callbackUrl,
  webOrigin,
}: AuthRouterOptions) {
  const router = express.Router();
  const requireAuth = createRequireAuth(sessions);

  const authFlowCookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: new URL(callbackUrl).pathname,
  } as const;

  const sessionCookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  } as const;

  router.get("/login", async (_req, res) => {
    const flow: AuthFlow = {
      state: client.randomState(),
      nonce: client.randomNonce(),
      codeVerifier: client.randomPKCECodeVerifier(),
    };

    const authorizationUrl = client.buildAuthorizationUrl(oidc, {
      redirect_uri: callbackUrl,
      scope: "openid email",
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: await client.calculatePKCECodeChallenge(flow.codeVerifier),
      code_challenge_method: "S256",
    });

    res.cookie(AUTH_FLOW_COOKIE, JSON.stringify(flow), {
      ...authFlowCookieOptions,
      maxAge: AUTH_FLOW_MAX_AGE_MS,
    });
    res.redirect(authorizationUrl.href);
  });

  router.get("/callback", async (req, res) => {
    const flow = readAuthFlow(req.cookies[AUTH_FLOW_COOKIE]);
    res.clearCookie(AUTH_FLOW_COOKIE, authFlowCookieOptions);

    try {
      if (!flow) throw new Error("Missing or malformed auth_flow cookie");

      const currentUrl = new URL(callbackUrl);
      currentUrl.search = new URL(req.originalUrl, callbackUrl).search;

      const { identity, authSessionId, idToken } = await exchangeCode(currentUrl, flow);
      const userId = await users.upsert(identity);

      const incomingToken: unknown = req.cookies[SESSION_COOKIE];
      if (typeof incomingToken === "string") {
        await sessions.delete(incomingToken);
      }

      const { token, expiresAt } = await sessions.create({
        userId,
        authSessionId,
        idToken,
      });

      res.cookie(SESSION_COOKIE, token, {
        ...sessionCookieOptions,
        expires: expiresAt,
      });
      res.redirect(new URL("/", webOrigin).href);
    } catch (error) {
      console.error("Login callback failed", error);
      res.redirect(new URL("/?login=failed", webOrigin).href);
    }
  });

  router.get("/me", requireAuth, (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ email: currentUser(res).email });
  });

  router.post("/logout", async (req, res) => {
    const incomingToken: unknown = req.cookies[SESSION_COOKIE];
    let idToken: string | undefined;

    if (typeof incomingToken === "string") {
      idToken = await sessions.end(incomingToken);
    }

    res.clearCookie(SESSION_COOKIE, sessionCookieOptions);

    const endSessionUrl =
      typeof idToken === "string"
        ? client.buildEndSessionUrl(oidc, {
            id_token_hint: idToken,
            post_logout_redirect_uri: webOrigin,
          })
        : new URL("/", webOrigin);

    res.redirect(endSessionUrl.href);
  });

  return router;
}
