import express from "express";
import * as client from "openid-client";
import type { OidcClient } from "./oidc.ts";

export const AUTH_FLOW_COOKIE = "auth_flow";
const AUTH_FLOW_MAX_AGE_MS = 10 * 60 * 1000;

export type AuthFlow = {
  state: string;
  nonce: string;
  codeVerifier: string;
};

export type AuthRouterOptions = {
  oidc: OidcClient;
  callbackUrl: string;
};

export function createAuthRouter({ oidc, callbackUrl }: AuthRouterOptions) {
  const router = express.Router();

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
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: new URL(callbackUrl).pathname,
      maxAge: AUTH_FLOW_MAX_AGE_MS,
    });
    res.redirect(authorizationUrl.href);
  });

  return router;
}
