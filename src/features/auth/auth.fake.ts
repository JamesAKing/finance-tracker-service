import { mock } from "node:test";

import * as client from "openid-client";

import type { CodeExchange, LoginResult } from "./oidc.ts";
import type { AuthRouterOptions } from "./routes.ts";
import type { SessionRepository } from "./session-repository.ts";
import type { UserRepository } from "./user-repository.ts";

export const FAKE_LOGIN: LoginResult = {
  identity: {
    issuer: "https://idp.example.test/realms/test",
    subject: "subject-123",
    email: "person@example.test",
  },
  authSessionId: "keycloak-session-1",
  idToken: "header.payload.signature",
};

export const ACTIVE_SESSION_TOKEN = "active-session-token";

export function createFakeAuth() {
  const exchangeCode = mock.fn<CodeExchange>(async () => FAKE_LOGIN);
  const upsertUser = mock.fn<UserRepository["upsert"]>(async () => "user-1");
  const createSession = mock.fn<SessionRepository["create"]>(async () => ({
    token: "new-session-token",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  }));
  const deleteSession = mock.fn<SessionRepository["delete"]>(async () => {});
  const endSession = mock.fn<SessionRepository["end"]>(async (token) =>
    token === ACTIVE_SESSION_TOKEN ? FAKE_LOGIN.idToken : undefined,
  );
  const findActiveSession = mock.fn<SessionRepository["findActive"]>(async (token) =>
    token === ACTIVE_SESSION_TOKEN
      ? { userId: "user-1", email: FAKE_LOGIN.identity.email }
      : undefined,
  );

  const options: AuthRouterOptions = {
    oidc: new client.Configuration(
      {
        issuer: "https://idp.example.test/realms/test",
        authorization_endpoint: "https://idp.example.test/realms/test/auth",
        end_session_endpoint: "https://idp.example.test/realms/test/logout",
      },
      "test-client",
      "test-secret",
    ),
    exchangeCode,
    users: { upsert: upsertUser },
    sessions: {
      create: createSession,
      delete: deleteSession,
      end: endSession,
      findActive: findActiveSession,
    },
    callbackUrl: "http://localhost:5173/api/auth/callback",
    webOrigin: "http://localhost:5173",
  };

  return {
    options,
    exchangeCode,
    upsertUser,
    createSession,
    deleteSession,
    endSession,
    findActiveSession,
  };
}
