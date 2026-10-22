// Shared contracts come from the published package; job cancellation stays local.
export type { ErrorCode, EffectClass, CapabilityInfo, RunOptions, Estimate, JobStatus, Job, CapabilitySummary, CapabilityDescription } from "@pramaan/sdk";
export type WaitOptions = import("@pramaan/sdk").WaitOptions & { readonly signal?: AbortSignal };
