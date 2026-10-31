import { defineRelations } from "drizzle-orm";
import * as schema from "./schema.ts";

export const relations = defineRelations(schema, (r) => ({
	sessions: {
		user: r.one.users({
			from: r.sessions.userId,
			to: r.users.id
		}),
	},
	users: {
		sessions: r.many.sessions(),
	},
}))