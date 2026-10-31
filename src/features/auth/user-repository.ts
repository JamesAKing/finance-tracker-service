import type { Database } from "../../db/db.ts";
import { users } from "../../db/schema.ts";

export type UserIdentity = {
  issuer: string;
  subject: string;
  email: string;
};

export function createUserRepository(db: Database) {
  return {
    async upsert({ issuer, subject, email }: UserIdentity) {
      const [user] = await db
        .insert(users)
        .values({ authIssuer: issuer, authSubject: subject, email })
        .onConflictDoUpdate({
          target: [users.authIssuer, users.authSubject],
          set: { email },
        })
        .returning({ id: users.id });

      if (!user) throw new Error("User upsert returned no row");
      return user.id;
    },
  };
}

export type UserRepository = ReturnType<typeof createUserRepository>;
