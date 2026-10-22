import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runVersionCli } from "@hypit/cli";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("the launched Distribution ignores inherited installation and launcher hints", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const launcher = join(root, "bin", "hypit.mjs");
  const result = spawnSync(process.execPath, [launcher, "version", "--json"], {
    encoding: "utf8", windowsHide: true,
    env: { ...process.env, HYPIT_DISTRIBUTION_ROOT: join(tmpdir(), "old-hypit"), HYPIT_CLI_LAUNCHER: join(tmpdir(), "old-hypit.mjs") },
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.distribution, join(root, "."));
  assert.equal(report.launcher, launcher);
});

test("version reads its Distribution without a project, Runtime or network request", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-version-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "@hypit/hypit", version: "0.1.8" }));
    let output = "";
    await runVersionCli(["version", "--json"], { write: (s) => { output += s; } }, {
      packageRoot: root, launcher: join(root, "bin", "hypit.mjs"),
    });
    assert.deepEqual(JSON.parse(output), {
      format: "hypit.cli-version@1", package: "@hypit/hypit", version: "0.1.8",
      distribution: root, launcher: join(root, "bin", "hypit.mjs"),
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("version refuses the removed update-check options instead of reaching the network", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-version-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "@hypit/hypit", version: "0.1.8" }));
    await assert.rejects(
      () => runVersionCli(["version", "--check", "--json"], { write: () => {} }, { packageRoot: root }),
      /Unknown version option: --check/u,
    );
    await assert.rejects(
      () => runVersionCli(["version", "--registry", "https://mirror.example/npm", "--json"], { write: () => {} }, { packageRoot: root }),
      /Unknown version option: --registry/u,
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});
