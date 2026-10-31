// Runs after `drizzle-kit pull` to patch output that doesn't work as generated.
// Each fix is a workaround for a drizzle-kit limitation; remove it once drizzle-kit handles the case.
import { readFileSync, writeFileSync } from "node:fs";

type Fix = { description: string; apply: (source: string) => string };

const fixes: Fix[] = [
  {
    // drizzle-kit writes relative imports without a file extension (`from "./schema"`),
    // which `nodenext` module resolution rejects. Add `.ts`, matching the rest of the codebase.
    description: "added .ts extensions to relative imports",
    apply: (source) => source.replace(/(from\s+["'])(\.{1,2}\/[^"'.]+)(["'])/g, "$1$2.ts$3"),
  },
  {
    // drizzle-kit (1.0.0-rc.5) introspects Postgres `bytea` as an untyped customType, so the
    // column's TypeScript type is `unknown`. drizzle-orm has a real `bytea()` column (typed as Buffer).
    description: "replaced untyped bytea customType with bytea()",
    apply: (source) => {
      const untypedBytea = /customType\(\{ dataType: \(\) => ['"]bytea['"] \}\)\(/g;
      if (!untypedBytea.test(source)) return source;

      return source
        .replace(untypedBytea, "bytea(")
        .replace(/import \{ ([^}]*) \} from "drizzle-orm\/pg-core"/, (statement, names: string) =>
          names.split(", ").includes("bytea")
            ? statement
            : `import { bytea, ${names} } from "drizzle-orm/pg-core"`,
        );
    },
  },
];

const generatedFiles = ["src/db/schema.ts", "src/db/relations.ts"];

for (const file of generatedFiles) {
  const original = readFileSync(file, "utf8");
  let source = original;

  for (const fix of fixes) {
    const fixed = fix.apply(source);
    if (fixed !== source) {
      console.log(`${file}: ${fix.description}`);
      source = fixed;
    }
  }

  if (source !== original) {
    writeFileSync(file, source);
  }
}
