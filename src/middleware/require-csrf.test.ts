import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { Request, Response } from "express";
import { HttpError } from "../api-contract.ts";
import { CSRF_COOKIE, requireCsrf } from "./require-csrf.ts";

function runRequireCsrf({
  method = "POST",
  cookie,
  header,
  body,
}: {
  method?: string;
  cookie?: string | undefined;
  header?: string | undefined;
  body?: unknown;
}) {
  const next = mock.fn();
  const req = {
    method,
    cookies: cookie === undefined ? {} : { [CSRF_COOKIE]: cookie },
    body,
    header: (name: string) => (name === "X-CSRF-Token" ? header : undefined),
  } as unknown as Request;

  requireCsrf(req, {} as Response, next);

  assert.equal(next.mock.callCount(), 1);
  return next.mock.calls[0]?.arguments[0];
}

function assertRejected(error: unknown) {
  assert.ok(error instanceof HttpError);
  assert.equal(error.status, 403);
  assert.equal(error.message, "Invalid CSRF token");
}

describe("requireCsrf", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    it(`lets a ${method} through without a token`, () => {
      assert.equal(runRequireCsrf({ method }), undefined);
    });
  }

  it("lets a request through when the header matches the cookie", () => {
    assert.equal(runRequireCsrf({ cookie: "the-token", header: "the-token" }), undefined);
  });

  it("lets a request through when the form field matches the cookie", () => {
    assert.equal(runRequireCsrf({ cookie: "the-token", body: { _csrf: "the-token" } }), undefined);
  });

  it("rejects a POST when the form field is wrong", () => {
    assertRejected(runRequireCsrf({ cookie: "the-token", body: { _csrf: "not-token" } }));
  });

  it("uses the header before the form field", () => {
    assert.equal(
      runRequireCsrf({ cookie: "the-token", header: "the-token", body: { _csrf: "not-token" } }),
      undefined,
    );
    assertRejected(
      runRequireCsrf({ cookie: "the-token", header: "not-token", body: { _csrf: "the-token" } }),
    );
  });

  for (const [name, cookie, header] of [
    ["without a cookie", undefined, "the-token"],
    ["without a header", "the-token", undefined],
    ["with an empty cookie", "", "the-token"],
    ["with an empty header", "the-token", ""],
    ["when the lengths differ", "the-token", "the-token-but-longer"],
    ["when the tokens differ", "the-token", "not-token"],
  ] as const) {
    it(`rejects a POST ${name}`, () => {
      assertRejected(runRequireCsrf({ cookie, header }));
    });
  }

  for (const method of ["PUT", "PATCH", "DELETE"]) {
    it(`checks a ${method} too`, () => {
      assertRejected(runRequireCsrf({ method }));
    });
  }
});
