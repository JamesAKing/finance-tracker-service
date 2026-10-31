import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/db.ts";
import { sessions } from "../../db/schema.ts";

export type NewSession = {
  userId: string;
  authSessionId: string | undefined;
  idToken: string;
};

type SessionRepositoryOptions = {
  maxLifespanSeconds: number;
};

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest();
}

export function createSessionRepository(
  db: Database,
  { maxLifespanSeconds }: SessionRepositoryOptions,
) {
  return {
    async create({ userId, authSessionId, idToken }: NewSession) {
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + maxLifespanSeconds * 1000);

      await db.insert(sessions).values({
        tokenHash: hashSessionToken(token),
        userId,
        authSessionId,
        idToken,
        expiresAt,
      });

      return { token, expiresAt };
    },

    async delete(token: string) {
      await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
    },
  };
}

export type SessionRepository = ReturnType<typeof createSessionRepository>;
