// @hypit/pramaan — the one module through which every outside call in this product flows.
// Built from PRAMAAN_API_KEY and optional PRAMAAN_BASE_URL. Nothing else in the repository
// talks to an outside service. Capability ids are the capabilities lab's; family helpers below
// map one product intent onto one capability id.

import { randomUUID } from "node:crypto";
import { capabilityInfo } from "./catalog.js";
import { DEFAULT_BASE_URL, PramaanClient } from "./sdk/client.js";
import { PramaanError } from "./sdk/errors.js";
import type { Estimate, RunOptions } from "./sdk/types.js";

export { DEFAULT_BASE_URL } from "./sdk/client.js";
export { PramaanClient } from "./sdk/client.js";
export { PramaanError } from "./sdk/errors.js";
export type {
	CapabilityDescription,
	CapabilityInfo,
	CapabilitySummary,
	EffectClass,
	Estimate,
	Job,
	JobStatus,
	RunOptions,
	WaitOptions,
} from "./sdk/types.js";

/** Capability ids this product calls, as a const so callers never mistype one. */
export const Cap = {
	videoGenerate: "video.generate",
	videoGenerateConfigured: "video.generate-configured",
	videoGenerateBulk: "video.generate-bulk",
	imageGenerate: "image.generate",
	imageGenerateConfigured: "image.generate-configured",
	imageGenerateBulk: "image.generate-bulk",
	imageEdit: "image.edit",
	audioSpeech: "audio.speech",
	soundtrackGenerate: "audio.soundtrack.generate",
	soundEffectsGenerate: "audio.sound-effects.generate",
	audioAlign: "audio.align",
	audioTranscribe: "audio.transcribe",
	audioTranscribeConfigured: "audio.transcribe-configured",
	audioModelsList: "audio.models.list",
	voiceCatalogList: "audio.voice-catalog.list",
	voiceDesign: "audio.voice.design",
	voiceCreate: "audio.voice.create",
	voiceClone: "audio.voice.clone",
	voicesList: "audio.voices.list",
	voiceDelete: "audio.voice.delete",
	videoBackgroundRemove: "video.background.remove",
	imageBackgroundRemove: "image.background.remove",
	videoFacesDetect: "video.faces.detect",
	mediaVideoDownload: "media.video.download",
	tiktokVideoResolve: "tiktok.video.resolve",
	tiktokVideoDetail: "tiktok.video.detail",
	tiktokVideoTranscript: "tiktok.video.transcript",
	youtubeVideoDetail: "youtube.video.detail",
	youtubeVideoTranscript: "youtube.video.transcript",
	instagramPostResolve: "instagram.post.resolve",
	tiktokFeedTrending: "tiktok.feed.trending",
	tiktokTrendsHashtags: "tiktok.trends.hashtags",
	tiktokSearchVideos: "tiktok.search.videos",
	youtubeSearchVideos: "youtube.search.videos",
	youtubeSearchShorts: "youtube.search.shorts",
	instagramSearchReels: "instagram.search.reels",
	instagramReelsTrending: "instagram.reels.trending",
	textTranslate: "text.translate",
	llmComplete: "llm.complete",
	llmCompleteBulk: "llm.complete-bulk",
} as const;

export type CapId = (typeof Cap)[keyof typeof Cap];

/**
 * A typed view over a client: `call` checks the id against this product's catalog and
 * returns the capability's result. Tests pass a FakePramaan with the same surface.
 */
export class Pramaan {
	constructor(private readonly client: PramaanClient) {}

	/** The untyped client, for capabilities not in Cap yet. */
	get raw(): PramaanClient {
		return this.client;
	}

	async call(id: CapId, input: unknown, opts?: RunOptions): Promise<unknown> {
		return await this.client.call(id, input, opts);
	}

	/** Async capabilities without waiting: the caller polls `raw.jobs`. */
	run(id: CapId, input: unknown, opts?: RunOptions): Promise<unknown> {
		return this.client.run(id, input, opts);
	}

	info(id: string) {
		return capabilityInfo(id) ?? this.client.info(id);
	}

	get jobs() {
		return this.client.jobs;
	}

	get capabilities() {
		return this.client.capabilities;
	}

	/** True when this API serves file uploads; when false, reference media must come from built material. */
	filesAvailable(): Promise<boolean> {
		return this.client.files.available();
	}

	/** Uploads reference media once; capabilities take the returned id as `fileId`. */
	uploadFile(
		bytes: Uint8Array,
		kind: "audio" | "image" | "video" | "document" | "data",
	): Promise<{ fileId: string }> {
		return this.client.files.upload(bytes, kind);
	}

	/** Downloads one result file's bytes. */
	download(url: string): Promise<Uint8Array> {
		return this.client.download(url);
	}

	/** What one planned call would cost at most. Run reports show this total, and nothing else. */
	async estimateFor(id: CapId, input: unknown): Promise<Estimate> {
		return await this.client.capabilities.estimate(id, input);
	}

	// ── Media generation ─────────────────────────────────────────────────────

	generateVideo(input: { readonly prompt: string } & Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.videoGenerate, input, opts);
	}
	generateVideoConfigured(input: Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.videoGenerateConfigured, input, opts);
	}
	generateImage(input: { readonly prompt: string } & Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.imageGenerate, input, opts);
	}
	generateImageConfigured(input: Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.imageGenerateConfigured, input, opts);
	}
	editImage(input: { readonly prompt: string; readonly images: readonly unknown[] } & Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.imageEdit, input, opts);
	}

	// ── Speech, voices, alignment ────────────────────────────────────────────

	speak(input: { readonly text: string } & Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.audioSpeech, input, opts);
	}
	soundtrack(input: Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.soundtrackGenerate, input, opts);
	}
	soundEffect(input: { readonly prompt: string } & Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.soundEffectsGenerate, input, opts);
	}
	designVoice(input: { readonly description: string } & Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.voiceDesign, input, opts);
	}
	createVoice(input: Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.voiceCreate, input, opts);
	}
	cloneVoice(input: Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.voiceClone, input, opts);
	}
	listVoices(opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.voicesList, {}, opts);
	}
	voiceCatalog(opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.voiceCatalogList, {}, opts);
	}
	alignWords(input: Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.audioAlign, input, opts);
	}
	transcribe(input: Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.audioTranscribe, input, opts);
	}
	transcribeConfigured(input: Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.audioTranscribeConfigured, input, opts);
	}

	// ── Repair and analysis ──────────────────────────────────────────────────

	removeVideoBackground(input: Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.videoBackgroundRemove, input, opts);
	}
	removeImageBackground(input: Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.imageBackgroundRemove, input, opts);
	}
	detectFaces(input: Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.videoFacesDetect, input, opts);
	}

	// ── Source videos ────────────────────────────────────────────────────────

	/**
	 * Fetches a source video by public URL into platform storage. Needs platform file
	 * storage, which is not live yet: the capability answers `upstream_unavailable`, and
	 * `sourceDownloadAvailable` says so before the call so the UI can show one plain
	 * "not available yet" message. Local file drop-in never needs this.
	 */
	downloadSourceVideo(input: { readonly url: string } & Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.mediaVideoDownload, input, opts);
	}
	tiktokResolve(input: { readonly url: string }, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.tiktokVideoResolve, input, opts);
	}
	tiktokDetail(input: Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.tiktokVideoDetail, input, opts);
	}
	tiktokTranscript(input: Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.tiktokVideoTranscript, input, opts);
	}
	youtubeDetail(input: Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.youtubeVideoDetail, input, opts);
	}
	youtubeTranscript(input: Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.youtubeVideoTranscript, input, opts);
	}
	instagramResolve(input: { readonly url: string }, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.instagramPostResolve, input, opts);
	}
	trending(input: { readonly platform: "tiktok" | "youtube" | "instagram" } & Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		const id = input.platform === "tiktok" ? Cap.tiktokFeedTrending
			: input.platform === "youtube" ? Cap.youtubeSearchVideos : Cap.instagramReelsTrending;
		return this.call(id, input, opts);
	}
	searchVideos(input: { readonly platform: "tiktok" | "youtube" | "instagram"; readonly query: string } & Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		const id = input.platform === "tiktok" ? Cap.tiktokSearchVideos
			: input.platform === "youtube" ? Cap.youtubeSearchVideos : Cap.instagramSearchReels;
		return this.call(id, input, opts);
	}

	// ── Text ─────────────────────────────────────────────────────────────────

	translate(input: { readonly text: string; readonly targetLanguage: string } & Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.textTranslate, input, opts);
	}
	copyComplete(input: { readonly messages: readonly unknown[] } & Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.llmComplete, input, opts);
	}
	copyCompleteBulk(input: Record<string, unknown>, opts?: RunOptions): Promise<unknown> {
		return this.call(Cap.llmCompleteBulk, input, opts);
	}
}

/** A new key for an `external_*` call: the same key can never run the call twice. */
export function idempotencyKey(): string {
	return randomUUID();
}

/** Builds a client from explicit settings (tests pass theirs). */
export function createPramaan(options: {
	apiKey: string;
	baseUrl?: string;
	fetch?: (input: string, init: RequestInit) => Promise<Response>;
	sleep?: (ms: number) => Promise<void>;
}): Pramaan {
	return new Pramaan(
		new PramaanClient({
			apiKey: options.apiKey,
			...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
			...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
			...(options.sleep !== undefined ? { sleep: options.sleep } : {}),
		}),
	);
}

/**
 * The one place `PRAMAAN_API_KEY` is read from the environment. Every consumer gets its
 * client (or its answer about whether one is configured) from here, so the key is read in
 * exactly one module. The key is never logged.
 *
 * With `PRAMAAN_FAKE=1` the client is the offline fake instead: any capability call fails
 * loudly rather than reaching the network, so a fresh clone smoke-tests with a dummy key.
 * Tests construct `FakePramaan` directly and never need this switch.
 */
export function pramaanFromEnv(): Pramaan | null {
	const apiKey = process.env.PRAMAAN_API_KEY?.trim();
	if (!apiKey) return null;
	if (process.env.PRAMAAN_FAKE?.trim() === "1") {
		return new Pramaan(
			new PramaanClient({
				apiKey: "fake",
				fetch: () =>
					Promise.reject(
						new Error("PRAMAAN_FAKE=1: network disabled for this run."),
					),
			}),
		);
	}
	const baseUrl = process.env.PRAMAAN_BASE_URL?.trim();
	return createPramaan({
		apiKey,
		...(baseUrl !== undefined && baseUrl.length > 0 ? { baseUrl } : {}),
	});
}

/** True when a key is configured — setup messages check this. */
export function pramaanKeySet(): boolean {
	return Boolean(process.env.PRAMAAN_API_KEY?.trim());
}
