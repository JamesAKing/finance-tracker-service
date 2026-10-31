import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  // The origin the browser uses (Vite in dev). Keycloak redirects back to `${WEB_ORIGIN}/api/auth/callback`
  WEB_ORIGIN: z.url(),
  OIDC_ISSUER_URL: z.url(),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1),
  // Keep in step with ssoSessionIdleTimeout / ssoSessionMaxLifespan in identity/keycloak/realm.json
  SESSION_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(1800),
  SESSION_MAX_LIFESPAN_SECONDS: z.coerce.number().int().positive().default(36000),
});

export type Config = ReturnType<typeof loadConfig>;

// The only place that reads process.env. Error messages name the variable but never echo its value
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  - ${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(`Invalid configuration:\n${problems.join("\n")}`);
  }

  const vars = result.data;
  return {
    port: vars.PORT,
    databaseUrl: vars.DATABASE_URL,
    webOrigin: vars.WEB_ORIGIN,
    oidc: {
      issuerUrl: vars.OIDC_ISSUER_URL,
      clientId: vars.OIDC_CLIENT_ID,
      clientSecret: vars.OIDC_CLIENT_SECRET,
    },
    session: {
      idleTimeoutSeconds: vars.SESSION_IDLE_TIMEOUT_SECONDS,
      maxLifespanSeconds: vars.SESSION_MAX_LIFESPAN_SECONDS,
    },
  };
}
