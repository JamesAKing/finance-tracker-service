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
  const invalid = new HttpError(403, "Invalid CSRF token");

  if (!isToken(cookieToken) || !isToken(headerToken)) return next(invalid);

  const cookieBytes = Buffer.from(cookieToken);
  const headerBytes = Buffer.from(headerToken);

  if (cookieBytes.length !== headerBytes.length) return next(invalid);
  if (!timingSafeEqual(cookieBytes, headerBytes)) return next(invalid);

  next();
};
