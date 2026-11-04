import { timingSafeEqual } from "node:crypto";

import type { RequestHandler } from "express";

import { HttpError } from "../api-contract.ts";

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

export const CSRF_COOKIE = "__Host-csrf";

export const csrfCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
} as const;

function isToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export const requireCsrf: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.includes(req.method)) return next();

  const cookieToken: unknown = req.cookies[CSRF_COOKIE];
  const headerToken: unknown = req.header("X-CSRF-Token");
  // Logout is a browser form post, so it cannot set a header. Use the form field instead.
  const bodyToken: unknown = (req.body as { _csrf?: unknown } | undefined)?._csrf;
  const requestToken = headerToken ?? bodyToken;
  const invalid = new HttpError(403, "Invalid CSRF token");

  if (!isToken(cookieToken) || !isToken(requestToken)) return next(invalid);

  const cookieBytes = Buffer.from(cookieToken);
  const requestBytes = Buffer.from(requestToken);

  if (cookieBytes.length !== requestBytes.length) return next(invalid);
  if (!timingSafeEqual(cookieBytes, requestBytes)) return next(invalid);

  next();
};
