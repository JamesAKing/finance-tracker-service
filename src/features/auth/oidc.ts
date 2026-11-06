import * as client from "openid-client";
import type { Config } from "../../config.ts";
import type { UserIdentity } from "./user-repository.ts";

export type OidcClient = client.Configuration;

export type AuthFlow = {
  state: string;
  nonce: string;
  codeVerifier: string;
};

export type LoginResult = {
  identity: UserIdentity;
  authSessionId: string | undefined;
  idToken: string;
};

export type CodeExchange = (currentUrl: URL, flow: AuthFlow) => Promise<LoginResult>;

function routeIssuerTo(issuer: URL, internal: URL): client.CustomFetch {
  return (url, options) => {
    const target = new URL(url);
    if (target.origin === issuer.origin) {
      target.protocol = internal.protocol;
      target.host = internal.host;
    }
    return fetch(target, { ...options, body: options.body ?? null });
  };
}

export async function discoverOidc({
  issuerUrl,
  internalUrl,
  clientId,
  clientSecret,
}: Config["oidc"]) {
  const issuer = new URL(issuerUrl);

  const isLocalHttp = issuer.protocol === "http:" && issuer.hostname === "localhost";

  try {
    return await client.discovery(issuer, clientId, clientSecret, undefined, {
      ...(isLocalHttp && { execute: [client.allowInsecureRequests] }),
      ...(internalUrl && { [client.customFetch]: routeIssuerTo(issuer, new URL(internalUrl)) }),
    });
  } catch (error) {
    throw new Error(`Could not discover OIDC issuer at ${issuer.href}`, {
      cause: error,
    });
  }
}

export function createCodeExchange(oidc: OidcClient): CodeExchange {
  return async (currentUrl, flow) => {
    const tokens = await client.authorizationCodeGrant(oidc, currentUrl, {
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      pkceCodeVerifier: flow.codeVerifier,
      idTokenExpected: true,
    });

    const claims = tokens.claims();
    if (!claims || !tokens.id_token) {
      throw new Error("Token response had no ID token");
    }
    if (typeof claims.email !== "string") {
      throw new Error("ID token has no email claim");
    }

    return {
      identity: { issuer: claims.iss, subject: claims.sub, email: claims.email },
      authSessionId: typeof claims.sid === "string" ? claims.sid : undefined,
      idToken: tokens.id_token,
    };
  };
}
