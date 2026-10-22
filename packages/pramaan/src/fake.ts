// A fake Pramaan for tests: no network, no key. Route handlers answer each capability;
// anything unrouted throws, so a test fails loudly when code reaches for the network.

import { PramaanError } from "./sdk/errors.js";
import {
	Cap,
	type CapId,
	Pramaan,
	PramaanClient,
} from "./index.js";
import type { RunOptions } from "./sdk/types.js";

/**
 * The action calls production refuses without an Idempotency-Key header
 * (400 invalid_request). Read-only capabilities do not need one. The fake
 * refuses the same way, so a test that would fail live fails here.
 */
const IDEMPOTENCY_REQUIRED: ReadonlySet<string> = new Set([
	Cap.voiceDesign,
	Cap.voiceCreate,
	Cap.voiceClone,
	Cap.voiceDelete,
]);

export type RouteHandler = (
	input: unknown,
	opts: RunOptions | undefined,
) => unknown | Promise<unknown>;

export class FakePramaan extends Pramaan {
	readonly calls: {
		id: string;
		input: unknown;
		opts: RunOptions | undefined;
	}[] = [];
	#routes: Readonly<Record<string, RouteHandler>>;

	constructor(routes: Record<string, RouteHandler> = {}) {
		// The parent only wraps a real client for its typed helpers; no call ever reaches it
		// because `call` is overridden below.
		super(
			new PramaanClient({
				apiKey: "fake",
				fetch: () =>
					Promise.reject(new Error("FakePramaan never reaches the network.")),
			}),
		);
		this.#routes = routes;
	}

	override async call(
		id: CapId,
		input: unknown,
		opts?: RunOptions,
	): Promise<unknown> {
		if (IDEMPOTENCY_REQUIRED.has(id) && !opts?.idempotencyKey) {
			throw new PramaanError(
				"invalid_request",
				"Idempotency-Key header is required for this capability.",
			);
		}
		this.calls.push({ id, input, opts });
		const route = this.#routes[id];
		if (!route) {
			throw new Error(
				`FakePramaan has no route for "${id}". Add one in the test.`,
			);
		}
		return await route(input, opts);
	}

	/** Every call made to a capability id, in order. */
	callsTo(id: CapId): unknown[] {
		return this.calls
			.filter((entry) => entry.id === id)
			.map((entry) => entry.input);
	}

	/** Route one or more capability calls after construction. */
	route(
		routes: Record<string, (input: unknown, opts?: RunOptions) => unknown>,
	): void {
		this.#routes = { ...this.#routes, ...routes };
	}
}
