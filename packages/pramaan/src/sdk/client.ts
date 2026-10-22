// Product file and cancellation helpers around @pramaan/sdk 0.1.0.

import { capabilityInfo } from "../catalog.js";
import { errorFromResponse, PramaanError } from "./errors.js";
import type {
	CapabilityInfo,
	Job,
	RunOptions,
	WaitOptions,
} from "./types.js";

/** The hosted API's URL: the one place the API domain is set. */
export { DEFAULT_BASE_URL } from "@pramaan/sdk";
import { DEFAULT_BASE_URL, Pramaan as PublishedPramaan } from "@pramaan/sdk";
const MIN_POLL_MS = 2_000;
const MAX_POLL_MS = 30_000;
const DEFAULT_WAIT_MS = 31 * 60_000;
const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 8_000;

export type { PramaanOptions } from "@pramaan/sdk";
import type { PramaanOptions } from "@pramaan/sdk";

interface ApiResponse {
	readonly status: number;
	readonly body: unknown;
}

async function readBody(response: Response): Promise<unknown> {
	const text = await response.text();
	if (text === "") return undefined;
	try {
		return JSON.parse(text);
	} catch {
		throw new PramaanError(
			"internal",
			"The API returned a response that is not JSON.",
			{
				requestId: response.headers.get("x-request-id") ?? undefined,
				status: response.status,
			},
		);
	}
}

/** Identify stored media from its bytes; the upload route validates MIME types. */
function uploadContentType(bytes: Uint8Array): string {
 const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
 if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
 if (ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0 && bytes[1] !== 0xd8)) return "audio/mpeg";
 if (ascii(0, 4) === "OggS") return "audio/ogg";
 if (ascii(0, 4) === "fLaC") return "audio/flac";
 if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
 if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
 if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
 if (ascii(0, 3) === "GIF") return "image/gif";
 if (ascii(4, 8) === "ftyp") return "video/mp4";
 if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";
 if (ascii(0, 5) === "%PDF-") return "application/pdf";
 return "application/octet-stream";
}

export class PramaanClient {
	readonly #sdkOptions: PramaanOptions;
	// Scope response metadata to one operation, including concurrent requests.
	async #usingSdk<T>(
		operation: (client: InstanceType<typeof PublishedPramaan>) => Promise<T>,
		opts?: RunOptions,
	): Promise<T> {
		let lastError: PramaanError | undefined;
		const client = new PublishedPramaan({
			...this.#sdkOptions,
			// Retries are controlled here: chat and outcome starts are never repeated.
			maxRetries: 0,
			fetch: async (url, init) => {
				const method = init.method ?? "GET";
				const path = new URL(url).pathname;
				const id = decodeURIComponent(path.split("/").pop() ?? "");
				const retry =
					method === "GET" ||
					path.endsWith("/estimate") ||
					(path.includes("/capabilities/") &&
						id !== "llm.chat" &&
						capabilityInfo(id)?.effectClass === "read_only");
				const headers = new Headers(init.headers);
				if (opts?.idempotencyKey === undefined)
					headers.delete("Idempotency-Key");

				for (let attempt = 0; ; attempt++) {
					try {
						const response = await this.#fetch(url, { ...init, headers });
						if (response.ok) { lastError = undefined; return response; }
						const previous = lastError;
                        lastError = await errorFromResponse(response.clone());
                        if (previous && lastError.code === "conflict" && lastError.retryable) {
                          lastError = previous;
                          return response;
                        }
						if (
							!retry ||
              !lastError.retryable ||
							(response.status !== 429 && response.status < 500) ||
							attempt >= this.#maxRetries
						)
							return response;
					} catch (error) {
						if (!retry || attempt >= this.#maxRetries) throw error;
					}
					await this.#sleep(
						lastError?.retryAfterMs ??
							Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS),
					);
				}
			},
		});
		try {
			return await operation(client);
		} catch (error) {
			throw lastError ?? error;
		}
	}

	readonly #apiKey: string;
	readonly #baseUrl: string;
	readonly #maxRetries: number;
	readonly #fetch: (input: string, init: RequestInit) => Promise<Response>;
	readonly #sleep: (ms: number) => Promise<void>;

	constructor(options: PramaanOptions) {
		if (!options?.apiKey) {
			throw new PramaanError(
				"unauthorized",
				"Pass apiKey to new PramaanClient().",
			);
		}
		this.#sdkOptions = options;
		this.#apiKey = options.apiKey;
		this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
		this.#maxRetries = options.maxRetries ?? 2;
		this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
		this.#sleep =
			options.sleep ??
			((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
	}

	/** Sync capability: its result. Async capability: a running Job (see `jobs.wait`). */
	async run(
		id: string,
		input: unknown,
		opts: RunOptions = {},
	): Promise<unknown> {
        return this.#usingSdk(client => client.run(id, input, opts), opts);
    }
    async call(id: string, input: unknown, opts: RunOptions = {}): Promise<unknown> {
        return this.#usingSdk(client => client.call(id, input, opts), opts);
    }

	/** Traits of one capability, from this product's mini-catalog. Sync and offline. */
	info(id: string): CapabilityInfo | undefined {
		return capabilityInfo(id);
	}

	readonly jobs = {
        get: (id: string): Promise<Job> => this.#usingSdk(client => client.jobs.get(id)),
        cancel: (id: string): Promise<Job> => this.#usingSdk(client => client.jobs.cancel(id)),

		/**
		 * Polls until the job is no longer running (every 2 s or more, growing 1.5x to 30 s) and
		 * returns it, whatever the final status. Throws `upstream_timeout` when `timeoutMs` passes.
		 */
		wait: async (id: string, options: WaitOptions = {}): Promise<Job> => {
			const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_WAIT_MS);
			let interval = Math.max(MIN_POLL_MS, options.intervalMs ?? MIN_POLL_MS);
			for (;;) {
				if (options.signal?.aborted) return this.jobs.cancel(id);
				const job = await this.jobs.get(id);
				if (job.status !== "running") return job;
				if (Date.now() + interval > deadline) {
					throw new PramaanError(
						"upstream_timeout",
						"The job is still running after timeoutMs.",
						{ retryable: false, jobId: id },
					);
				}
				if (options.signal) {
					const signal = options.signal;
					let wake: () => void = () => {};
					const aborted = new Promise<void>((resolve) => {
						wake = resolve;
						signal.addEventListener("abort", wake, { once: true });
					});
					try {
						if (!signal.aborted)
							await Promise.race([this.#sleep(interval), aborted]);
					} finally {
						signal.removeEventListener("abort", wake);
					}
				} else await this.#sleep(interval);
				interval = Math.min(Math.ceil(interval * 1.5), MAX_POLL_MS);
			}
		},
	};

	readonly files = {
		/**
		 * Uploads bytes so a capability can take them as `fileId`. The platform keeps the
		 * file; generation capabilities accept the returned id for reference media.
		 */
		upload: async (
			bytes: Uint8Array,
			kind: "audio" | "image" | "video" | "document" | "data",
		): Promise<{ fileId: string }> => {
			const response = await this.#rawRequest(
				"POST",
				`/v1/files?kind=${encodeURIComponent(kind)}`,
				bytes,
				(kind === "audio" && uploadContentType(bytes) === "video/mp4") ? "audio/mp4" : uploadContentType(bytes),
			);
			const body = response.body as Record<string, unknown>;
			if (typeof body.fileId !== "string" || body.fileId.length === 0) {
				throw new PramaanError(
					"internal",
					"The API returned an unexpected file shape.",
				);
			}
			return { fileId: body.fileId };
		},

		/** True when this API serves file uploads (a newer deployment may not). */
		available: async (): Promise<boolean> => {
			try {
				await this.#request("GET", "/v1/files", { retry: true });
				return true;
			} catch (error) {
				if (error instanceof PramaanError && error.code === "not_found") return false;
				throw error;
			}
		},
	};

	/** Downloads one result file's bytes (the capability's own kept file). */
	async download(url: string): Promise<Uint8Array> {
		const response = await this.#fetch(url, {
			headers: { Accept: "*/*" },
		});
		if (!response.ok) {
			throw await errorFromResponse(response);
		}
		return new Uint8Array(await response.arrayBuffer());
	}

	async #rawRequest(
		method: "GET" | "POST",
		path: string,
		body: Uint8Array,
		contentType: string,
	): Promise<ApiResponse> {
		const init: RequestInit = {
			method,
			headers: {
				Authorization: `Bearer ${this.#apiKey}`,
				"Content-Type": contentType,
				Accept: "application/json",
			},
			body: new Uint8Array(body) as unknown as BodyInit,
		};
		try {
			const response = await this.#fetch(`${this.#baseUrl}${path}`, init);
			if (response.ok) {
				return { status: response.status, body: await readBody(response) };
			}
			throw await errorFromResponse(response);
		} catch (thrown) {
			if (thrown instanceof PramaanError) throw thrown;
			throw new PramaanError(
				"upstream_unavailable",
				"Could not reach the Pramaan API.",
				{ retryable: true },
			);
		}
	}

    readonly capabilities = {
        list: () => this.#usingSdk(client => client.capabilities.list()),
        get: (id: string) => this.#usingSdk(client => client.capabilities.get(id)),
        estimate: (id: string, input: unknown, opts: RunOptions = {}) => this.#usingSdk(client => client.capabilities.estimate(id, input, opts), opts),
    };

	async #request(
		method: "GET" | "POST",
		path: string,
		options: {
			body?: unknown;
			idempotencyKey?: string;
			headers?: Record<string, string>;
			retry?: boolean;
		},
	): Promise<ApiResponse> {
		const headers: Record<string, string> = {
			...options.headers,
			Authorization: `Bearer ${this.#apiKey}`,
			Accept: "application/json",
		};
		if (options.body !== undefined)
			headers["Content-Type"] = "application/json";
		// The same key on every attempt, so a retry can never run the call twice.
		if (options.idempotencyKey !== undefined)
			headers["Idempotency-Key"] = options.idempotencyKey;
		const init: RequestInit = {
			method,
			headers,
			...(options.body !== undefined
				? { body: JSON.stringify(options.body) }
				: {}),
		};

		let previous: PramaanError | undefined;
		for (let attempt = 0; ; attempt++) {
			let error: PramaanError;
			let retryAfterMs: number | undefined;
			try {
				const response = await this.#fetch(`${this.#baseUrl}${path}`, init);
				if (response.ok) {
					return { status: response.status, body: await readBody(response) };
				}
				error = await errorFromResponse(response);
				const after = Number(response.headers.get("retry-after"));
				if (Number.isFinite(after) && after > 0) retryAfterMs = after * 1000;
			} catch (thrown) {
				if (thrown instanceof PramaanError) throw thrown;
				error = new PramaanError(
					"upstream_unavailable",
					"Could not reach the Pramaan API.",
					{
						retryable: true,
					},
				);
			}
			// A retry with the same Idempotency-Key can meet the first attempt's still-held
			// reservation (409, retryable). The first failure is the real answer, so report that.
			if (previous && error.code === "conflict" && error.retryable)
				throw previous;
			previous = error;
			const transient =
				error.status === undefined ||
				error.status === 429 ||
				error.status >= 500;
			if (!options.retry || !error.retryable || !transient || attempt >= this.#maxRetries)
				throw error;
			await this.#sleep(
				retryAfterMs ??
					Math.min(
						RETRY_BASE_MS * 2 ** attempt + Math.random() * 100,
						RETRY_MAX_MS,
					),
			);
		}
	}
}

/** The per-call price limit and second-opinion options as request headers. */
function priceHeaders(opts: RunOptions): Record<string, string> {
	return {
		...(opts.maxPriceMicro !== undefined
			? { "Pramaan-Max-Price-Micro": String(opts.maxPriceMicro) }
			: {}),
		...(opts.secondOpinion ? { "Pramaan-Second-Opinion": "true" } : {}),
	};
}
