// drizzle-kit writes relative imports without a file extension (`from "./schema"`),
// which `nodenext` module resolution rejects. This runs after `drizzle-kit pull` and
// adds the `.ts` extension, matching how the rest of the codebase imports.
import { readFileSync, writeFileSync } from "node:fs";

const generatedFiles = ["src/db/schema.ts", "src/db/relations.ts"];

// Matches `from "./something"` where `something` has no extension yet.
const extensionlessImport = /(from\s+["'])(\.{1,2}\/[^"'.]+)(["'])/g;

for (const file of generatedFiles) {
  const source = readFileSync(file, "utf8");
  const fixed = source.replace(extensionlessImport, "$1$2.ts$3");

  if (fixed !== source) {
    writeFileSync(file, fixed);
    console.log(`Added file extensions to imports in ${file}`);
  }
}
