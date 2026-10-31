import * as client from "openid-client";
import type { Config } from "../../config.ts";

export type OidcClient = client.Configuration;

export async function discoverOidc({ issuerUrl, clientId, clientSecret }: Config["oidc"]) {
  const issuer = new URL(issuerUrl);

  const isLocalHttp = issuer.protocol === "http:" && issuer.hostname === "localhost";

  try {
    return await client.discovery(issuer, clientId, clientSecret, undefined, {
      ...(isLocalHttp && { execute: [client.allowInsecureRequests] }),
    });
  } catch (error) {
    throw new Error(`Could not discover OIDC issuer at ${issuer.href}`, {
      cause: error,
    });
  }
}
