import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ts from "typescript";

// Regression coverage for the other packaging bug src/-only tests can't see:
// dist/index.d.ts imports `FromSchema` from "json-schema-to-ts" (see
// types.ts), so that package has to be resolvable wherever the shipped
// .d.ts is. Inside this monorepo it always resolves, dependency-or-dev-
// dependency, because `pnpm install` at the workspace root installs every
// workspace package's devDependencies too — so the bug is invisible to any
// check that stays inside the repo's own install. A real external consumer
// (`npm install @dagstree/schema` from the registry) only gets
// "dependencies" installed transitively; "devDependencies" never ships.
//
// This test reproduces that boundary without any network access: it
// symlinks only the packages @dagstree/schema's package.json currently
// lists under "dependencies" (read from the file, so this can't drift from
// the real manifest) into a scratch node_modules, copies in the built dist
// the same way `npm pack`'s "files" field would, and then type-checks a
// probe file against that consumer's-eye-view node_modules. If
// json-schema-to-ts (or any future type-only import the public surface
// picks up) is ever left out of "dependencies", this fails with the exact
// TS2307 "Cannot find module" a real consumer would hit.
const schemaDir = fileURLToPath(new URL("..", import.meta.url));
const distIndexDts = join(schemaDir, "dist", "index.d.ts");
const distExists = existsSync(distIndexDts);

describe.skipIf(!distExists)("a consumer with only the declared dependencies installed", () => {
  it("still resolves real manifest types from the shipped .d.ts (not `any`)", () => {
    const pkg = JSON.parse(readFileSync(join(schemaDir, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps.length, "expected @dagstree/schema to declare at least one dependency").toBeGreaterThan(0);

    const requireFromSchema = createRequire(join(schemaDir, "package.json"));
    const consumerDir = mkdtempSync(join(tmpdir(), "dagstree-schema-consumer-"));

    try {
      const nodeModules = join(consumerDir, "node_modules");
      mkdirSync(nodeModules, { recursive: true });

      // Symlink (junction, so this needs no elevated Windows privilege) each
      // declared dependency to wherever it's already installed for this
      // workspace package -- exactly what npm/pnpm would place for a real
      // consumer, minus the network round-trip.
      for (const dep of deps) {
        const depPackageJson = requireFromSchema.resolve(`${dep}/package.json`);
        symlinkSync(dirname(depPackageJson), join(nodeModules, dep), "junction");
      }

      const scopedDir = join(nodeModules, "@dagstree");
      mkdirSync(scopedDir, { recursive: true });
      const pkgDir = join(scopedDir, "schema");
      mkdirSync(pkgDir, { recursive: true });
      cpSync(join(schemaDir, "dist"), join(pkgDir, "dist"), { recursive: true });
      cpSync(join(schemaDir, "package.json"), join(pkgDir, "package.json"));

      // A plain type-alias trick to detect `any` (e.g. `0 extends 1 & T`)
      // does not actually catch this: under skipLibCheck, an unresolved
      // import inside a .d.ts degrades the type it produces into something
      // the checker treats leniently for assignability without it reading
      // back as TypeFlags.Any through that idiom. What does reliably show
      // the degradation -- confirmed by reproducing it by hand against this
      // exact harness before writing this assertion -- is an assignment
      // that would only compile if the right-hand side were `any`:
      // `manifest.project.name` (really a `string`) assigned to a `number`.
      // With json-schema-to-ts unresolved this compiles with zero
      // diagnostics; with it resolved, TS2322 "not assignable" fires.
      const probePath = join(consumerDir, "probe.ts");
      writeFileSync(
        probePath,
        [
          'import type { DagstreeManifestV1 } from "@dagstree/schema";',
          "",
          "declare const manifest: DagstreeManifestV1;",
          "const nameAsNumber: number = manifest.project.name;",
          "void nameAsNumber;",
        ].join("\n"),
        "utf8",
      );

      // Same knobs as tsconfig.base.json (moduleResolution NodeNext,
      // skipLibCheck) -- skipLibCheck is exactly the setting that lets the
      // unresolved import degrade silently to `any` instead of a hard
      // TS2307, so it has to be on here to reproduce the real failure mode.
      const program = ts.createProgram([probePath], {
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        module: ts.ModuleKind.NodeNext,
        target: ts.ScriptTarget.ES2023,
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        noEmit: true,
      });
      const diagnostics = ts.getPreEmitDiagnostics(program);
      const formatted = ts.formatDiagnostics(diagnostics, {
        getCanonicalFileName: (f) => f,
        getCurrentDirectory: () => consumerDir,
        getNewLine: () => "\n",
      });
      // A real `string` assigned to `number` must fail to compile. If this
      // comes back empty, `DagstreeManifestV1["project"]["name"]` silently
      // degraded to `any` for this consumer -- exactly the bug being
      // guarded against.
      expect(diagnostics.length, `expected a type error; got none:\n${formatted}`).toBeGreaterThan(0);
      expect(formatted).toMatch(/not assignable/);
    } finally {
      rmSync(consumerDir, { recursive: true, force: true });
    }
  });
});
