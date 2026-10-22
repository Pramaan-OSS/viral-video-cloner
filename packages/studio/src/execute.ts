import { MemoryResourceStore, Executor } from "@hypit/hypit/executor";
import type { ResourceStore } from "@hypit/hypit/runtime";
import type { BuildState, BuildCommand } from "@hypit/hypit/protocol";
import type { CliTransientExecution as RuntimeHostTransientExecution } from "@hypit/hypit/cli";

import type { StudioDomain } from "./domain.js";

export type Executed = {
  readonly state: BuildState;
  readonly status: string;
  /** Capabilities whose material is not built yet; the projection renders placeholders. */
  readonly deferred: readonly { readonly capability: string; readonly count: number }[];
  readonly unserved: readonly { readonly capability: string; readonly count: number }[];
  readonly errors: readonly string[];
};

/**
 * Run the display closure: deterministic Producers, plus Needs the Runtime explicitly permits in
 * a disposable authoring execution. The Runtime owns Endpoint selection and invocation; Studio
 * never filters Providers or sees their handlers.
 *
 * A Need whose material the author has not built yet does not fail the projection: the command is
 * deferred, reported, and the deterministic remainder keeps executing, so the Studio opens with
 * placeholders instead of refusing the production. Submit generation through `hypit build`.
 */
export async function executeStudioProjection(
  domain: StudioDomain,
  planned: BuildState,
  resources: ResourceStore,
  execution?: RuntimeHostTransientExecution,
): Promise<Executed> {
  const deferred = new Map<string, number>();
  const openStatus = planned.status;
  // The planned state keeps every command, including ones later iterations defer.
  const plannedOutstanding: readonly BuildCommand[] = planned.outstanding;
  let state: BuildState = planned;
  let seen: string | undefined;
  type LoopResult = Awaited<ReturnType<RuntimeHostTransientExecution["evaluate"]>> & {
    readonly status: string;
    readonly state: BuildState;
    readonly blocked: readonly { readonly command: string; readonly reason?: string; readonly subject?: string }[];
    readonly outcomes: readonly { readonly command: string; readonly kind: string; readonly status: string; readonly message?: string }[];
  };
  let result: LoopResult;
  for (;;) {
    result = execution === undefined
      ? await new Executor({
          producers: domain.producers,
          validators: domain.validators,
          resources,
        }).run(state)
      : await execution.evaluate({
          state,
          producers: domain.producers,
          validators: domain.validators,
          resources,
        });
    const pendingNeed = pendingNeedCommand(result, state, result.state);
    if (pendingNeed === undefined || pendingNeed.command === seen) break;
    seen = pendingNeed.command;
    const name = needCapabilityName(result.state.outstanding, pendingNeed.command)
      ?? needCapabilityName(plannedOutstanding, pendingNeed.command);
    if (name !== undefined) deferred.set(name, (deferred.get(name) ?? 0) + 1);
    const outstanding = result.state.outstanding.filter((command) => command.id !== pendingNeed.command);
    if (outstanding.length === result.state.outstanding.length) break;
    state = { ...result.state, status: openStatus, outstanding };
  }
  const counts = new Map<string, number>();
  for (const item of result.blocked as readonly { readonly command: string; readonly subject: string }[]) {
    const command = result.state.outstanding.find((candidate) => candidate.id === item.command);
    if (command?.kind === "fulfill-need") continue;
    counts.set(item.subject, (counts.get(item.subject) ?? 0) + 1);
  }
  return {
    state: result.state,
    status: result.status,
    deferred: [...deferred].map(([capability, count]) => ({ capability, count })),
    unserved: [...counts].map(([capability, count]) => ({ capability, count })),
    errors: result.outcomes
      .filter((entry) => entry.status === "error" && entry.kind !== "fulfill-need")
      .map((entry) => entry.message ?? "a Producer failed without saying why"),
  };
}

/** The first Need command this authoring execution could not serve, if any. */
function pendingNeedCommand(
  result: {
    readonly blocked: readonly { readonly command: string }[];
    readonly outcomes: readonly { readonly command: string; readonly kind: string; readonly status: string }[];
  },
  state: BuildState,
  resultState: BuildState,
): { readonly command: string } | undefined {
  for (const outcome of result.outcomes) {
    if (outcome.status === "error" && outcome.kind === "fulfill-need") {
      return { command: outcome.command };
    }
  }
  for (const item of result.blocked) {
    const command = state.outstanding.find((candidate) => candidate.id === item.command)
      ?? resultState.outstanding.find((candidate) => candidate.id === item.command);
    if (command?.kind === "fulfill-need") return { command: item.command };
  }
  return undefined;
}

function needCapabilityName(
  plannedOutstanding: readonly BuildCommand[],
  commandId: string,
): string | undefined {
  const command = plannedOutstanding.find((candidate) => candidate.id === commandId);
  if (command?.kind !== "fulfill-need") return undefined;
  return `${command.need.capability.module.name}@${command.need.capability.module.version}#${command.need.capability.name}`;
}

export { MemoryResourceStore };
