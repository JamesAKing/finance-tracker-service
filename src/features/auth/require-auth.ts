import type { RequestHandler, Response } from "express";
import { HttpError } from "../../api-contract.ts";
import type { CurrentUser, SessionRepository } from "./session-repository.ts";

export const SESSION_COOKIE = "__Host-session";

export function createRequireAuth(sessions: Pick<SessionRepository, "findActive">): RequestHandler {
  return async (req, res, next) => {
    const token: unknown = req.cookies[SESSION_COOKIE];
    const user = typeof token === "string" ? await sessions.findActive(token) : undefined;

    if (!user) {
      next(new HttpError(401, "Not authenticated"));
      return;
    }

    res.locals.user = user;
    next();
  };
}

export function currentUser(res: Response) {
  return res.locals.user as CurrentUser;
}
