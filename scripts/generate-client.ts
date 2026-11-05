// Generates the web client's API code from openapi.yaml, using OpenAPI Generator's Docker image
// so nobody needs Java installed. Usage: npm run generate:client -- <output dir>
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const GENERATOR_IMAGE = "openapitools/openapi-generator-cli:v7.26.0";

const repoDir = resolve(import.meta.dirname, "..");
const outputArg = process.argv[2];

if (!outputArg) {
  console.error("Missing output directory. Usage: npm run generate:client -- <output dir>");
  process.exit(1);
}

const outputDir = resolve(outputArg);

if (!existsSync(resolve(outputDir, ".."))) {
  console.error(`Output directory's parent does not exist: ${outputDir}`);
  process.exit(1);
}

// Run as the current user so the generated files aren't owned by root (not needed on Windows)
const user =
  process.getuid && process.getgid ? ["--user", `${process.getuid()}:${process.getgid()}`] : [];

execFileSync(
  "docker",
  [
    "run",
    "--rm",
    ...user,
    "--volume",
    `${repoDir}:/spec:ro`,
    "--volume",
    `${outputDir}:/out`,
    GENERATOR_IMAGE,
    "generate",
    "--input-spec",
    "/spec/openapi.yaml",
    "--generator-name",
    "typescript-fetch",
    "--global-property",
    "apiDocs=false,modelDocs=false",
    "--output",
    "/out",
  ],
  { stdio: "inherit" },
);

console.log(`Generated the client into ${outputDir}`);
