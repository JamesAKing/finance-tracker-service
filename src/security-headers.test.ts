import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { Request, Response } from "express";

import { setSecureHeaders } from "./security-headers.ts";

describe("setSecureHeaders", () => {
  it("sets the security headers and passes the request on", () => {
    const setHeader = mock.fn();
    const next = mock.fn();

    setSecureHeaders({} as Request, { setHeader } as unknown as Response, next);

    assert.deepEqual(
      setHeader.mock.calls.map((call) => call.arguments),
      [
        ["X-Content-Type-Options", "nosniff"],
        ["Referrer-Policy", "no-referrer"],
        ["Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"],
        ["Cross-Origin-Resource-Policy", "same-origin"],
      ],
    );
    assert.equal(next.mock.callCount(), 1);
  });
});
