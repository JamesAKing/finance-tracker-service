import { bytea, pgTable, uuid, text, customType, timestamp, index, foreignKey, primaryKey, unique } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const sessions = pgTable("sessions", {
	id: uuid().defaultRandom().primaryKey(),
	tokenHash: bytea("token_hash").notNull(),
	userId: uuid("user_id").notNull(),
	authSessionId: text("auth_session_id"),
	idToken: text("id_token").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).default(sql`now()`).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.userId],
		foreignColumns: [users.id],
		name: "sessions_user_id_fkey"
	}).onDelete("cascade"),
	index("sessions_user_id_idx").using("btree", table.userId.asc().nullsLast()),
	unique("sessions_token_hash_key").on(table.tokenHash),]);

export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey(),
	authIssuer: text("auth_issuer").notNull(),
	authSubject: text("auth_subject").notNull(),
	email: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	unique("users_auth_issuer_auth_subject_key").on(table.authIssuer, table.authSubject),]);
