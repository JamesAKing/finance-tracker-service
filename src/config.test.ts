import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "./config.ts";

const validEnv = {
  DATABASE_URL: "postgres://postgres:password@localhost:5434/finance_tracker",
  WEB_ORIGIN: "http://localhost:5173",
  OIDC_ISSUER_URL: "http://localhost:8080/realms/finance-tracker",
  OIDC_CLIENT_ID: "finance-tracker-api",
  OIDC_CLIENT_SECRET: "test-secret",
};

describe("loadConfig", () => {
  it("maps env vars and applies defaults", () => {
    const config = loadConfig(validEnv);

    assert.equal(config.port, 3000);
    assert.equal(config.databaseUrl, validEnv.DATABASE_URL);
    assert.equal(config.webOrigin, validEnv.WEB_ORIGIN);
    assert.deepEqual(config.oidc, {
      issuerUrl: validEnv.OIDC_ISSUER_URL,
      internalUrl: undefined,
      clientId: validEnv.OIDC_CLIENT_ID,
      clientSecret: validEnv.OIDC_CLIENT_SECRET,
    });
    assert.deepEqual(config.session, {
      idleTimeoutSeconds: 1800,
      maxLifespanSeconds: 36000,
    });
  });

  it("parses numeric values from strings", () => {
    const config = loadConfig({
      ...validEnv,
      PORT: "4000",
      SESSION_IDLE_TIMEOUT_SECONDS: "60",
    });

    assert.equal(config.port, 4000);
    assert.equal(config.session.idleTimeoutSeconds, 60);
  });

  it("lists every missing variable in one error", () => {
    assert.throws(
      () => loadConfig({}),
      (error: Error) => {
        for (const name of [
          "DATABASE_URL",
          "WEB_ORIGIN",
          "OIDC_ISSUER_URL",
          "OIDC_CLIENT_ID",
          "OIDC_CLIENT_SECRET",
        ]) {
          assert.match(error.message, new RegExp(`- ${name}:`));
        }
        return true;
      },
    );
  });

  it("rejects invalid values", () => {
    assert.throws(
      () => loadConfig({ ...validEnv, WEB_ORIGIN: "not a url", PORT: "abc" }),
      /WEB_ORIGIN[\s\S]*PORT|PORT[\s\S]*WEB_ORIGIN/,
    );
  });

  it("does not include secret values in the error", () => {
    assert.throws(
      () =>
        loadConfig({
          ...validEnv,
          OIDC_CLIENT_SECRET: "",
          DATABASE_URL: "s3cret-not-a-url",
        }),
      (error: Error) => {
        assert.doesNotMatch(error.message, /s3cret-not-a-url/);
        return true;
      },
    );
  });
});
