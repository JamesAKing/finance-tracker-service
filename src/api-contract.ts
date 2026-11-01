import { STATUS_CODES } from "node:http";
import { fileURLToPath } from "node:url";
import type { ErrorRequestHandler } from "express";
import * as OpenApiValidator from "express-openapi-validator";

type ApiSpec = Parameters<typeof OpenApiValidator.middleware>[0]["apiSpec"];

export const API_SPEC_PATH = fileURLToPath(new URL("../openapi.yaml", import.meta.url));

export function enforceApiContract(apiSpec: ApiSpec = API_SPEC_PATH) {
  return OpenApiValidator.middleware({
    apiSpec,
    validateRequests: { removeAdditional: "all" },
    validateResponses: true,
    validateSecurity: false,
  });
}

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function statusOf(error: unknown) {
  const status = (error as { status?: unknown } | undefined)?.status;
  return typeof status === "number" && status >= 400 && status <= 599 ? status : 500;
}

export const sendProblem: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const status = statusOf(error);
  if (status >= 500) console.error(error);

  const detail = status < 500 && error instanceof Error ? error.message : undefined;

  res
    .status(status)
    .type("application/problem+json")
    .send(JSON.stringify({ title: STATUS_CODES[status] ?? "Error", status, detail }));
};
