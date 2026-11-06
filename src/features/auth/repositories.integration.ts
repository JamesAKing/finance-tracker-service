import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { createDb } from "../../db/db.ts";
import { sessions, users } from "../../db/schema.ts";
import { createSessionRepository, hashSessionToken } from "./session-repository.ts";
import { createUserRepository } from "./user-repository.ts";

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "DATABASE_URL must be set to run integration tests");

const db = createDb(databaseUrl);
const userRepository = createUserRepository(db);
const sessionRepository = createSessionRepository(db, {
  maxLifespanSeconds: 36000,
  idleTimeoutSeconds: 1800,
});

const issuer = `https://idp.example.test/${randomUUID()}`;

after(async () => {
  await db.delete(users).where(eq(users.authIssuer, issuer));
  await db.$client.end();
});

describe("user repository (real database)", () => {
  it("creates a user on first login and reuses them after, refreshing the email", async () => {
    const firstId = await userRepository.upsert({
      issuer,
      subject: "sub-1",
      email: "old@example.test",
    });
    const secondId = await userRepository.upsert({
      issuer,
      subject: "sub-1",
      email: "new@example.test",
    });

    assert.equal(secondId, firstId);
    const rows = await db.select().from(users).where(eq(users.authIssuer, issuer));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.email, "new@example.test");
  });
});

describe("session repository (real database)", () => {
  it("stores only a hash of the token, with an absolute expiry", async () => {
    const userId = await userRepository.upsert({
      issuer,
      subject: "sub-2",
      email: "s@example.test",
    });
    const before = Date.now();

    const { token, expiresAt } = await sessionRepository.create({
      userId,
      authSessionId: "kc-session",
      idToken: "id-token",
    });

    const [row] = await db.select().from(sessions).where(eq(sessions.userId, userId));
    assert.ok(row);
    assert.deepEqual(row.tokenHash, hashSessionToken(token));
    assert.notDeepEqual(row.tokenHash, Buffer.from(token));
    assert.equal(row.expiresAt.getTime(), expiresAt.getTime());
    assert.ok(expiresAt.getTime() >= before + 36000 * 1000);
  });

  it("deletes a session by its token", async () => {
    const userId = await userRepository.upsert({
      issuer,
      subject: "sub-3",
      email: "d@example.test",
    });
    const { token } = await sessionRepository.create({
      userId,
      authSessionId: undefined,
      idToken: "id-token",
    });

    await sessionRepository.delete(token);

    const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
    assert.equal(rows.length, 0);
  });

  describe("end", () => {
    it("deletes the session and returns the ID token it held", async () => {
      const userId = await userRepository.upsert({
        issuer,
        subject: "sub-end",
        email: "e@example.test",
      });
      const { token } = await sessionRepository.create({
        userId,
        authSessionId: undefined,
        idToken: "stored-id-token",
      });

      const idToken = await sessionRepository.end(token);

      assert.equal(idToken, "stored-id-token");
      const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
      assert.equal(rows.length, 0);
    });

    it("returns nothing when there is no such session, and does not fail", async () => {
      assert.equal(await sessionRepository.end("not-a-real-token"), undefined);
    });

    it("leaves other sessions alone", async () => {
      const userId = await userRepository.upsert({
        issuer,
        subject: "sub-end-other",
        email: "o@example.test",
      });
      const first = await sessionRepository.create({
        userId,
        authSessionId: undefined,
        idToken: "id-token-1",
      });
      await sessionRepository.create({ userId, authSessionId: undefined, idToken: "id-token-2" });

      await sessionRepository.end(first.token);

      const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.idToken, "id-token-2");
    });
  });

  describe("findActive", () => {
    async function createSessionFor(subject: string) {
      const userId = await userRepository.upsert({
        issuer,
        subject,
        email: `${subject}@example.test`,
      });
      const { token } = await sessionRepository.create({
        userId,
        authSessionId: undefined,
        idToken: "id-token",
      });
      return { userId, token };
    }

    it("returns the user for an active session and records that it was seen", async () => {
      const { userId, token } = await createSessionFor("active");
      await db
        .update(sessions)
        .set({ lastSeenAt: new Date(Date.now() - 60_000) })
        .where(eq(sessions.userId, userId));

      const user = await sessionRepository.findActive(token);

      assert.deepEqual(user, { userId, email: "active@example.test" });
      const [row] = await db.select().from(sessions).where(eq(sessions.userId, userId));
      assert.ok(row && row.lastSeenAt.getTime() > Date.now() - 10_000);
    });

    it("returns nothing for a token that doesn't exist", async () => {
      assert.equal(await sessionRepository.findActive("not-a-real-token"), undefined);
    });

    it("returns nothing once the absolute lifetime has passed", async () => {
      const { userId, token } = await createSessionFor("expired");
      await db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(sessions.userId, userId));

      assert.equal(await sessionRepository.findActive(token), undefined);
    });

    it("returns nothing once the session has been idle too long", async () => {
      const { userId, token } = await createSessionFor("idle");
      await db
        .update(sessions)
        .set({ lastSeenAt: new Date(Date.now() - 1801 * 1000) })
        .where(eq(sessions.userId, userId));

      assert.equal(await sessionRepository.findActive(token), undefined);
    });
  });
});
