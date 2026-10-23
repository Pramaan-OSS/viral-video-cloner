import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { globSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import sharp from "sharp";
import test from "node:test";
import ts from "typescript";
import { createVideoDistribution } from "@hypit/video";
import { installDistributionPackageResolution } from "@hypit/loader/node";
import { loadStudioDomain } from "../src/domain.js";
import { loadStudioCompanionRegistry } from "../src/companion-assembly.js";
import { loadStudioRun } from "../src/run.js";
import { executeStudioProjection, MemoryResourceStore } from "../src/execute.js";
import { readStudioSession } from "../src/session.js";

const repositoryRoot = new URL("../../../", import.meta.url).pathname;

/**
 * A shipped example production opens in the Studio projection with no unresolved
 * entries. The semantic-composition example is code-rendered: its whole display
 * closure is deterministic, so a fresh checkout resolves it completely.
 */
test("the shipped semantic-composition example opens in the Studio projection", async (t) => {
  const exampleRoot = `${repositoryRoot}examples/semantic-composition/`;
  installDistributionPackageResolution([repositoryRoot]);
  // The example resolves its own author packages from its project directory.
  const previousCwd = process.cwd();
  process.chdir(exampleRoot);
  t.after(() => process.chdir(previousCwd));
  // The example's author packages compile to dist/ the way its README directs.
  for (const name of ["chat-scene", "responsive-explainer"]) {
    const packageRoot = `${exampleRoot}packages/${name}`;
    const configPath = `${packageRoot}/tsconfig.json`;
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, packageRoot);
    const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
    const emitted = program.emit();
    const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitted.diagnostics);
    assert.equal(diagnostics.length, 0, `${name} build failed: ${ts.formatDiagnostics(diagnostics, { getCurrentDirectory: () => packageRoot, getCanonicalFileName: (name) => name, getNewLine: () => String.fromCharCode(10) })}`);
  }
  const runPath = `${exampleRoot}chat.svrun`;
  const domain = await loadStudioDomain({ run: runPath, workspaceRoot: exampleRoot,
    packageRoot: exampleRoot, distribution: createVideoDistribution() });
  const registry = await loadStudioCompanionRegistry({ distributionPackageRoot: repositoryRoot, sourcePackages: domain.packages });
  const run = await loadStudioRun({ run: runPath, domain, registry });

  const executed = await executeStudioProjection(domain, run.plan(run.run, run.targets).state, new MemoryResourceStore());
  assert.deepEqual(executed.unserved, [], "no entry stays unresolved");
  assert.deepEqual(executed.errors, []);

  const session = await readStudioSession({
    domain, registry, run,
    revision: 1, workspaceRoot: exampleRoot,
  });
  assert.deepEqual(session.declarationIssues, []);
  assert.ok(session.snapshot.timeline.frameCount > 0, "the Timeline resolves");
  assert.ok(session.snapshot.tracks.length > 0, "the composition has content");
  assert.ok(session.visualHtml.includes("<!doctype html>"));
});

/**
 * Generation whose material is not built yet is deferred, not unresolved: a
 * shipped example that uses the family packages still opens, with placeholders.
 */
test("a family-package production defers unbuilt generation instead of failing", async (t) => {
  const sourceRoot = `${repositoryRoot}examples/ranking-football/`;
  const exampleRoot = await mkdtemp(join(tmpdir(), "video-example-projection-"));
  t.after(() => rm(exampleRoot, { recursive: true, force: true }));
  // Authored sources ship; private example media does not. Build disposable
  // synthetic assets so this compilation check works in the public archive.
  for (const pattern of ["**/*.svml", "**/*.svs", "**/*.svrun"]) {
    for (const file of globSync(pattern, { cwd: sourceRoot })) {
      await mkdir(dirname(join(exampleRoot, file)), { recursive: true });
      await copyFile(join(sourceRoot, file), join(exampleRoot, file));
    }
  }
  const source = await readFile(join(exampleRoot, "reference.svml"), "utf8");
  await mkdir(join(exampleRoot, "assets"));
  for (const [, asset] of source.matchAll(/src="\.\/assets\/([^"]+)"/gu)) {
    const path = join(exampleRoot, "assets", asset!);
    if (/\.jpe?g$/u.test(path)) {
      await sharp({ create: { width: 64, height: 64, channels: 3, background: "#6688aa" } }).jpeg().toFile(path);
    } else {
      execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "1", path]);
    }
  }
  const runPath = join(exampleRoot, "reference.svrun");
  const domain = await loadStudioDomain({ run: runPath, workspaceRoot: exampleRoot,
    packageRoot: repositoryRoot, distribution: createVideoDistribution() });
  const registry = await loadStudioCompanionRegistry({ distributionPackageRoot: repositoryRoot, sourcePackages: domain.packages });
  const run = await loadStudioRun({ run: runPath, domain, registry });
  const executed = await executeStudioProjection(domain, run.plan(run.run, run.targets).state, new MemoryResourceStore());
  assert.deepEqual(executed.unserved, [], "no entry stays unresolved");
  const deferredNames = executed.deferred.map((item) => item.capability);
  assert.ok(
    deferredNames.some((name) => name.startsWith("@hypit/image-family@")),
    `the image family is deferred, not unresolved: ${deferredNames.join(", ")}`,
  );
  assert.deepEqual(executed.errors, []);
});
