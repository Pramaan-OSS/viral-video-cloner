import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { CliIo } from "./output.js";

export type VersionEnvironment = {
  readonly packageRoot: string;
  readonly launcher?: string;
};

export function writeVersionHelp(io: Pick<CliIo, "write">): void {
  io.write("Usage: hypit version [--json]\n\n"
    + "Show the executing Distribution and launcher without opening a project or Runtime.\n"
    + "hypit --version remains a local version-only query.\n");
}

/** Installation discovery belongs to the root CLI Host, never to one domain contribution. */
export async function runVersionCli(
  argv: readonly string[],
  io: CliIo,
  environment: VersionEnvironment,
): Promise<void> {
  let json = false;
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") json = true;
    else if (arg === "--help") { writeVersionHelp(io); return; }
    else if (arg !== "--no-color" && arg !== "--debug") throw new Error(`Unknown version option: ${arg}`);
  }
  const manifest = JSON.parse(await readFile(resolve(environment.packageRoot, "package.json"), "utf8")) as {
    name: string; version: string;
  };
  const report = {
    format: "hypit.cli-version@1", package: manifest.name, version: manifest.version,
    distribution: resolve(environment.packageRoot),
    ...(environment.launcher === undefined ? {} : { launcher: resolve(environment.launcher) }),
  };
  if (json) { io.write(`${JSON.stringify(report, null, 2)}\n`); return; }
  io.write(`${manifest.name} ${manifest.version}\nDistribution: ${report.distribution}\n`
    + (report.launcher === undefined ? "" : `Launcher: ${report.launcher}\n`));
}
