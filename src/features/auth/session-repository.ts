import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Database } from "../../db/db.ts";
import { sessions, users } from "../../db/schema.ts";

export type NewSession = {
  userId: string;
  authSessionId: string | undefined;
  idToken: string;
};

type SessionRepositoryOptions = {
  maxLifespanSeconds: number;
  idleTimeoutSeconds: number;
};

export type CurrentUser = {
  userId: string;
  email: string;
};

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest();
}

export function createSessionRepository(
  db: Database,
  { maxLifespanSeconds, idleTimeoutSeconds }: SessionRepositoryOptions,
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

    async findActive(token: string): Promise<CurrentUser | undefined> {
      const [user] = await db
        .update(sessions)
        .set({ lastSeenAt: sql`now()` })
        .from(users)
        .where(
          and(
            eq(sessions.userId, users.id),
            eq(sessions.tokenHash, hashSessionToken(token)),
            gt(sessions.expiresAt, sql`now()`),
            gt(sessions.lastSeenAt, sql`now() - make_interval(secs => ${idleTimeoutSeconds})`),
          ),
        )
        .returning({ userId: users.id, email: users.email });

      return user;
    },

    async delete(token: string) {
      await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
    },

    async end(token: string) {
      const [row] = await db
        .delete(sessions)
        .where(eq(sessions.tokenHash, hashSessionToken(token)))
        .returning({ idToken: sessions.idToken });

      return row?.idToken;
    },
  };
}

export type SessionRepository = ReturnType<typeof createSessionRepository>;
