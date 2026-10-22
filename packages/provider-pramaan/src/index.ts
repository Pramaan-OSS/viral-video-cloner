import {
  generationTypes,
  sealGeneratedAudioSet,
  sealGeneratedImageSet,
  sealGeneratedVideoSet,
} from "@hypit/generation";
import type { GenerationRequest } from "@hypit/generation";
import { canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, CanonicalValue, CapabilityRef, TypeRef } from "@hypit/hypit/protocol";
import type {
  EndpointFulfillment,
  EndpointInvocationContext,
  EndpointOutcome,
  EndpointPricingReader,
  EndpointPollContext,
  EndpointStartContext,
  ImmediateEndpointHandler,
  ResourceStore,
} from "@hypit/hypit/endpoint";
import { credentialRef, defineEndpoint, wakeAfter } from "@hypit/hypit/endpoint";
import { sealAlignedTranscriptEvidence, speechEvidenceTypes } from "@hypit/speech-evidence";
import {
  interpretWhisperXTranscript,
  verifyWhisperXAlignmentRequest,
  whisperXCapabilities,
} from "@hypit/whisperx";
import type { WhisperXTranscriptResponse } from "@hypit/whisperx";
import { Cap, createPramaan, idempotencyKey, pramaanFromEnv } from "@hypit/pramaan";
import type { Pramaan } from "@hypit/pramaan";

function createPramaanFromSecret(secret: string): Pramaan {
  return createPramaan({ apiKey: secret });
}

export const pramaanProviderModuleRef = { name: "@hypit/provider-pramaan", version: "1" } as const;

const VIDEO_FAMILY = { name: "@hypit/video-family", version: "1" } as const;
const IMAGE_FAMILY = { name: "@hypit/image-family", version: "1" } as const;
const SPEECH_FAMILY = { name: "@hypit/speech-family", version: "1" } as const;
const VOICE_FAMILY = { name: "@hypit/voice-family", version: "1" } as const;
const MATTING_FAMILY = { name: "@hypit/matting-family", version: "1" } as const;

export const pramaanServedCapabilities = {
  videoGenerate: { module: VIDEO_FAMILY, name: "generate" },
  imageGenerate: { module: IMAGE_FAMILY, name: "generate" },
  speak: { module: SPEECH_FAMILY, name: "speak" },
  soundEffect: { module: SPEECH_FAMILY, name: "sound-effect" },
  soundtrack: { module: SPEECH_FAMILY, name: "soundtrack" },
  voiceDesign: { module: VOICE_FAMILY, name: "design" },
  matte: { module: MATTING_FAMILY, name: "matte" },
  alignment: whisperXCapabilities.alignment,
} as const satisfies Readonly<Record<string, CapabilityRef>>;

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

function scalar(request: GenerationRequest, port: string): string | number | boolean | undefined {
  const value = request.ports[port]?.[0];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}

function mediaArtifacts(request: GenerationRequest, port: string): readonly BlobRef[] {
  return (request.ports[port] ?? []).flatMap((value) =>
    typeof value === "object" && value !== null && "artifact" in value
      ? [(value as { artifact: BlobRef }).artifact] : []);
}

type MediaKind = "audio" | "image" | "video";
function kindOf(artifact: BlobRef): MediaKind {
  return artifact.mediaType.startsWith("audio/") ? "audio"
    : artifact.mediaType.startsWith("video/") ? "video" : "image";
}

async function uploadArtifact(client: Pramaan, resources: ResourceStore, artifact: BlobRef): Promise<string> {
  const bytes = await resources.get(artifact.resource);
  assert(bytes !== undefined, `Reference artifact ${artifact.resource} is unavailable`);
  assert(bytes.byteLength === artifact.size, `Reference artifact ${artifact.resource} size differs`);
  const { fileId } = await client.uploadFile(bytes, kindOf(artifact));
  return fileId;
}

const FALLBACK_MEDIA_TYPES: Record<MediaKind, string> = {
  audio: "audio/mpeg",
  image: "image/png",
  video: "video/mp4",
};

async function downloadArtifact(client: Pramaan, resources: ResourceStore, url: string,
  mediaType: string, kind: MediaKind): Promise<BlobRef> {
  const bytes = await client.download(url);
  return await resources.put(bytes, mediaType === "application/octet-stream" ? FALLBACK_MEDIA_TYPES[kind] : mediaType);
}

function kindFromUrl(url: string): MediaKind {
  return /\.(mp4|webm|mov)(\?|$)/iu.test(url) ? "video"
    : /\.(png|jpg|jpeg|webp)(\?|$)/iu.test(url) ? "image"
    : "audio";
}

type Orientation = "portrait" | "landscape" | "square";
function orientation(ratio: string | undefined): Orientation {
  if (ratio === undefined) return "square";
  if (["9:16", "2:3", "3:4", "4:5", "1:3", "9:21"].includes(ratio)) return "portrait";
  if (["16:9", "3:2", "4:3", "5:4", "3:1", "21:9", "8:1"].includes(ratio)) return "landscape";
  return "square";
}

function textValue(request: GenerationRequest, port: string): string {
  const value = request.ports[port]?.[0];
  assert(typeof value === "string" && value.trim().length > 0, `The request carries no ${port}`);
  return value;
}

/** Maps one family generation request onto its Pramaan capability call. */
async function callPramaan(
  client: Pramaan,
  context: EndpointInvocationContext | EndpointStartContext,
  capability: CapabilityRef,
): Promise<{ id: string; input: Record<string, unknown> }> {
  const request = context.need.constraints as unknown as GenerationRequest;
  const key = `${capability.module.name}#${capability.name}`;
  if (key === `${VIDEO_FAMILY.name}#generate`) {
    const duration = scalar(request, "duration");
    const resolution = scalar(request, "resolution");
    const input: Record<string, unknown> = {
      prompt: textValue(request, "prompt").slice(0, 4000),
      aspect: orientation(scalar(request, "aspectRatio") as string | undefined),
      quality: resolution === "480p" ? "fast" : "best",
      ...(typeof duration === "number" && duration >= 1 ? { durationSeconds: Math.min(Math.round(duration), 60) } : {}),
    };
    return { id: Cap.videoGenerate, input };
  }
  if (key === `${IMAGE_FAMILY.name}#generate`) {
    const prompt = textValue(request, "prompt").slice(0, 4000);
    const references = mediaArtifacts(request, "images");
    const resolution = scalar(request, "resolution");
    const resolutionBand = resolution === "2K" ? "2048" : resolution === "4K" ? "4096" : "1024";
    if (references.length > 0) {
      const images: Array<{ fileId: string }> = [];
      for (const artifact of references) images.push({ fileId: await uploadArtifact(client, context.resources, artifact) });
      return { id: Cap.imageEdit, input: {
        prompt, images,
        ...(scalar(request, "aspectRatio") !== undefined ? { aspectRatio: scalar(request, "aspectRatio") } : {}),
        resolution: resolutionBand,
        format: scalar(request, "outputFormat") === "jpg" ? "jpeg" : "png",
      } };
    }
    return { id: Cap.imageGenerateConfigured, input: {
      prompt,
      ...(scalar(request, "aspectRatio") !== undefined ? { aspectRatio: scalar(request, "aspectRatio") } : {}),
      resolution: resolutionBand,
      format: scalar(request, "outputFormat") === "jpg" ? "jpeg" : "png",
    } };
  }
  if (key === `${SPEECH_FAMILY.name}#speak`) {
    const voice = scalar(request, "voice");
    const described = typeof voice === "string" ? voice.toLowerCase() : "";
    return { id: Cap.audioSpeech, input: {
      text: textValue(request, "text"),
      voice: described.includes("female") ? "female" : described.includes("male") ? "male" : "neutral",
    } };
  }
  if (key === `${SPEECH_FAMILY.name}#sound-effect`) {
    return { id: Cap.soundEffectsGenerate, input: { prompt: textValue(request, "prompt").slice(0, 1000) } };
  }
  if (key === `${SPEECH_FAMILY.name}#soundtrack`) {
    const video = mediaArtifacts(request, "video")[0];
    const input: Record<string, unknown> = { musicPrompt: textValue(request, "prompt").slice(0, 200) };
    if (video !== undefined) input.videoFileId = await uploadArtifact(client, context.resources, video);
    return { id: Cap.soundtrackGenerate, input };
  }
  if (key === `${VOICE_FAMILY.name}#design`) {
    // The voice comes from a recording when one is attached; otherwise the description
    // designs one. The spoken line rides on the plain speech capability either way.
    const text = textValue(request, "text");
    const recording = mediaArtifacts(request, "voiceReference")[0];
    const description = scalar(request, "voiceDescription");
    if (recording !== undefined) {
      const bytes = await context.resources.get(recording.resource);
      assert(bytes !== undefined, "The voice recording is unavailable");
      const { fileId } = await client.uploadFile(bytes, "audio");
      const clone = await client.call(Cap.voiceClone, {
        name: `voice-${Date.now()}`,
        samples: [{ fileId }],
        ...(typeof description === "string" && description.trim().length > 0 ? { description: description.slice(0, 1000) } : {}),
      }, { idempotencyKey: idempotencyKey() });
      const ref = (clone as { ref?: unknown }).ref;
      assert(typeof ref === "string", "The cloned voice answered without a ref");
      return { id: Cap.audioSpeech, input: { text, voice: ref } };
    }
    assert(typeof description === "string" && description.trim().length >= 20,
      "The request carries no voice: attach a recording or write a description of at least 20 characters");
    const design = await client.call(Cap.voiceDesign, {
      description: description.slice(0, 1000),
      autoGenerateText: text.length < 100,
      ...(text.length >= 100 ? { text: text.slice(0, 1000) } : {}),
    }, { idempotencyKey: idempotencyKey() });
    const designed = design as { ref?: unknown; previews?: { ref?: unknown }[] };
    const previewRef = designed.ref ?? designed.previews?.[0]?.ref;
    assert(typeof previewRef === "string", "The designed voice answered without a ref");
    const created = await client.call(Cap.voiceCreate, {
      ref: previewRef,
      name: `voice-${Date.now()}`,
      description: description.slice(0, 1000),
    }, { idempotencyKey: idempotencyKey() });
    const keptRef = (created as { ref?: unknown }).ref;
    assert(typeof keptRef === "string", "The kept voice answered without a ref");
    return { id: Cap.audioSpeech, input: { text, voice: keptRef } };
  }
  throw new Error(`No Pramaan route serves ${capability.module.name}#${capability.name}`);
}

/** The Pramaan capability id a family request maps to, without running anything. */
function pramaanIdFor(capability: CapabilityRef): string {
  const key = `${capability.module.name}#${capability.name}`;
  if (key === `${VIDEO_FAMILY.name}#generate`) return Cap.videoGenerate;
  if (key === `${IMAGE_FAMILY.name}#generate`) return Cap.imageGenerateConfigured;
  if (key === `${SPEECH_FAMILY.name}#speak`) return Cap.audioSpeech;
  if (key === `${SPEECH_FAMILY.name}#sound-effect`) return Cap.soundEffectsGenerate;
  if (key === `${SPEECH_FAMILY.name}#soundtrack`) return Cap.soundtrackGenerate;
  if (key === `${VOICE_FAMILY.name}#design`) return Cap.audioSpeech;
  if (key === `${MATTING_FAMILY.name}#matte`) return Cap.videoBackgroundRemove;
  if (capability.module.name === whisperXCapabilities.alignment.module.name) return Cap.audioTranscribeConfigured;
  throw new Error(`No Pramaan route serves ${capability.module.name}#${capability.name}`);
}

/** Run reports show Pramaan's estimate for the planned call: a total, and nothing else. */
function estimatePricingReader(client: Pramaan): EndpointPricingReader {
  const cache = new Map<string, CanonicalValue>();
  return async ({ request }) => {
    const id = pramaanIdFor(request.capability);
    let pending = cache.get(id);
    if (pending === undefined) {
      const description = await client.raw.capabilities.get(id);
      pending = canonicalize({ total: description.priceEstimateMicro, canRun: true });
      cache.set(id, pending);
    }
    return [{ source: "pramaan-estimate", data: pending }];
  };
}

function inline(value: unknown): { value: { kind: "inline"; value: CanonicalValue } } {
  return { value: { kind: "inline", value: canonicalize(value) } };
}

type Handle = { readonly contract: "hypit.pramaan-operation@1"; readonly jobId: string };

function jobId(value: unknown): string {
  assert(typeof value === "object" && value !== null, "The job answer is not an object");
  const id = (value as { id?: unknown }).id;
  assert(typeof id === "string" && id.length > 0, "The job answer has no id");
  return id;
}

function resultFile(result: unknown): { url: string; mediaType: string } {
  const rows: unknown[] = Array.isArray(result) ? result
    : typeof result === "object" && result !== null && Array.isArray((result as { videos?: unknown }).videos) ? (result as { videos: unknown[] }).videos
    : typeof result === "object" && result !== null && Array.isArray((result as { images?: unknown }).images) ? (result as { images: unknown[] }).images
    : [result];
  const first = rows[0];
  assert(typeof first === "object" && first !== null, "The call answered without a file");
  const url = (first as { url?: unknown }).url ?? (first as { audioUrl?: unknown }).audioUrl ?? (first as { videoUrl?: unknown }).videoUrl;
  assert(typeof url === "string" && url.length > 0, "The result file carries no url");
  const rawType = (first as { contentType?: unknown }).contentType;
  const format = (first as { format?: unknown }).format;
  const mediaType = typeof rawType === "string" && rawType.length > 0 ? rawType
    : format === "png" ? "image/png"
    : format === "jpeg" ? "image/jpeg"
    : "application/octet-stream";
  return { url, mediaType };
}

function failure(error: unknown): EndpointOutcome {
  return { status: "failed", failure: { code: "PRAMAAN_ERROR", message: error instanceof Error ? error.message : String(error) } };
}

function returnsFor(capability: CapabilityRef): TypeRef {
  if (capability.module.name === whisperXCapabilities.alignment.module.name) return speechEvidenceTypes.alignedTranscript;
  if (capability.module.name === IMAGE_FAMILY.name) return generationTypes.imageSet;
  if (capability.module.name === VIDEO_FAMILY.name || capability.module.name === MATTING_FAMILY.name) return generationTypes.videoSet;
  return generationTypes.audioSet;
}

/**
 * The apiKey slot defaults to the environment variable and can be rebound to another
 * Credential Store in a Runtime Profile (a file Store, for example). The Pramaan key is
 * still the only setting a person makes; this slot only gives the `auth` CLI something to
 * manage and lets a deployment keep the key outside `.env`.
 */
const pramaanCredential = credentialRef("env", "PRAMAAN_API_KEY");

/** The one Pramaan Endpoint: every family capability this product generates is served here. */
export function createPramaanProvider(options: {
  /** Tests inject a fake client; production builds one from PRAMAAN_API_KEY. */
  readonly client?: Pramaan;
  readonly pollIntervalMs?: number;
  readonly instance?: string;
  /** A Runtime Profile may rebind the slot to another Credential Store (a file Store, for example). */
  readonly apiKey?: ReturnType<typeof credentialRef>;
} = {}) {
  const missingKey = (): never => {
    throw new Error("Add PRAMAAN_API_KEY to .env; nothing else is needed");
  };
  let client = options.client ?? pramaanFromEnv() ?? new Proxy({} as Pramaan, {
    get: (_target, property) => {
      if (property === "then") return undefined;
      return () => missingKey();
    },
  });
  let clientSecret = options.client === undefined ? process.env.PRAMAAN_API_KEY?.trim() : undefined;
  // A rebound Credential Store supplies the secret per invocation; build that client on demand.
  const clientFor = (context: { readonly credentials?: Readonly<Record<string, { readonly secret?: unknown }>> }): Pramaan => {
    const secret = context.credentials?.apiKey?.secret;
    if (typeof secret !== "string" || secret.length === 0 || secret === clientSecret) return client;
    client = createPramaanFromSecret(secret);
    clientSecret = secret;
    return client;
  };
  const pollIntervalMs = options.pollIntervalMs ?? 10_000;

  const asyncEndpoint = {
    async start(context: EndpointStartContext): Promise<EndpointOutcome> {
      try {
        const active = clientFor(context);
        let mapped: { id: string; input: Record<string, unknown> };
        if (context.need.capability.module.name === MATTING_FAMILY.name) {
          const request = context.need.constraints as unknown as GenerationRequest;
          const source = mediaArtifacts(request, "source")[0];
          assert(source !== undefined, "The matting request carries no source video");
          mapped = { id: Cap.videoBackgroundRemove, input: { fileId: await uploadArtifact(active, context.resources, source) } };
        } else {
          mapped = await callPramaan(active, context, context.need.capability);
        }
        await context.reportProgress?.({ phase: "Submitted to Pramaan" });
        const started = await active.run(mapped.id as never, mapped.input);
        const id = jobId(started);
        const handle: Handle = { contract: "hypit.pramaan-operation@1", jobId: id };
        await context.checkpoint?.({ handle: canonicalize(handle), receipt: { id } });
        return wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: "running" });
      } catch (error) {
        return failure(error);
      }
    },
    async poll(context: EndpointPollContext): Promise<EndpointOutcome> {
      try {
        const handle = context.handle as unknown as Handle;
        assert(handle.contract === "hypit.pramaan-operation@1", "The Pramaan handle is invalid");
        const job = await client.raw.jobs.get(handle.jobId);
        if (job.status === "running") return wakeAfter(context.handle, pollIntervalMs, Date.now(), { phase: "running" });
        if (job.status === "failed" || job.status === "cancelled") {
          return { status: "failed", failure: { code: "PRAMAAN_JOB_FAILED", message: job.error?.message ?? `The job ended with status "${job.status}"` } };
        }
        return { status: "ready", handle: context.handle, receipt: { id: handle.jobId } };
      } catch (error) {
        return failure(error);
      }
    },
    async collect(context: EndpointPollContext): Promise<EndpointOutcome> {
      try {
        const handle = context.handle as unknown as Handle;
        const job = await client.raw.jobs.get(handle.jobId);
        assert(job.status === "done", "The job is not done");
        const file = resultFile(job.result);
        const kind = context.need.capability.module.name === IMAGE_FAMILY.name ? "image" : kindFromUrl(file.url);
        const blob = await downloadArtifact(client, context.resources, file.url, file.mediaType, kind);
        const value = context.need.capability.module.name === IMAGE_FAMILY.name
          ? sealGeneratedImageSet({ images: [blob] })
          : sealGeneratedVideoSet({ videos: [blob] });
        return { status: "completed", result: { value: { kind: "inline", value: canonicalize(value) } } };
      } catch (error) {
        return failure(error);
      }
    },
  };

  const immediate = (capability: CapabilityRef): ImmediateEndpointHandler =>
    async (context): Promise<EndpointFulfillment> => {
      const active = clientFor(context);
      if (capability.module.name === whisperXCapabilities.alignment.module.name) {
        const request = verifyWhisperXAlignmentRequest(context.need.constraints);
        const bytes = await context.resources.get(request.audio.resource);
        assert(bytes !== undefined && bytes.byteLength === request.audio.size,
          "The alignment audio is unavailable or has changed");
        const models = await active.call(Cap.audioModelsList, { language: request.language }, { idempotencyKey: idempotencyKey() }) as {
          results: { ref?: string; quality: string; batch: boolean; languages: string[] }[];
        };
        const selected = models.results.find((model) => model.batch && model.quality === "standard"
          && model.languages.includes(request.language) && model.ref)
          ?? models.results.find((model) => model.batch && model.quality === "economy"
            && model.languages.includes(request.language) && model.ref);
        assert(selected?.ref, "No compatible speech recognition model is available");
        const { fileId } = await active.uploadFile(bytes, "audio");
        await context.reportProgress?.({ phase: "Transcribing with word timings" });
        const response = await active.call(Cap.audioTranscribeConfigured, {
          ref: selected.ref,
          fileId,
          channels: 1,
          language: request.language,
          speakerLabels: false,
        }, { idempotencyKey: idempotencyKey() });
        // The transcription answers word times in seconds; the evidence wants 16 kHz samples.
        const transcript: WhisperXTranscriptResponse = {
          language: request.language,
          words: (response as { transcript?: { channels?: { words?: unknown }[] } }).transcript?.channels?.[0]?.words
            ?? (response as { words?: unknown }).words
            ?? flattenSegmentWords((response as { segments?: unknown }).segments),
        };
        const evidence = sealAlignedTranscriptEvidence({
          domainId: request.domainId,
          sampleFrames: request.sampleFrames,
          passages: interpretWhisperXTranscript(transcript, request.sampleFrames),
        });
        await context.reportProgress?.({ phase: "Word timing ready" });
        return inline(evidence);
      }
      const mapped = await callPramaan(active, context, capability);
      await context.reportProgress?.({ phase: "Calling Pramaan" });
      const result = await active.call(mapped.id as never, mapped.input);
      const file = resultFile(result);
      const kind = mapped.id === Cap.imageEdit || mapped.id === Cap.imageGenerate || mapped.id === Cap.imageGenerateConfigured
        ? "image" : kindFromUrl(file.url);
      const blob = await downloadArtifact(active, context.resources, file.url, file.mediaType, kind);
      const sealed = kind === "image"
        ? sealGeneratedImageSet({ images: [blob] })
        : sealGeneratedAudioSet({ audios: [blob] });
      return inline(sealed);
    };

  return defineEndpoint({
    instance: options.instance ?? "pramaan.default",
    pool: options.instance ?? "pramaan.default",
    pricing: { kind: "local" },
    readPricing: estimatePricingReader(client),
    credentials: { apiKey: options.apiKey ?? pramaanCredential },
    defaultConcurrency: 4,
    capabilities: [
      { capability: pramaanServedCapabilities.videoGenerate, returns: returnsFor(pramaanServedCapabilities.videoGenerate), lifecycle: "asynchronous", endpoint: asyncEndpoint, capacity: "video.generate" },
      { capability: pramaanServedCapabilities.matte, returns: returnsFor(pramaanServedCapabilities.matte), lifecycle: "asynchronous", endpoint: asyncEndpoint, capacity: "video.background.remove" },
      { capability: pramaanServedCapabilities.imageGenerate, returns: returnsFor(pramaanServedCapabilities.imageGenerate), lifecycle: "immediate", handler: immediate(pramaanServedCapabilities.imageGenerate), capacity: "image.generate" , transient: true },
      { capability: pramaanServedCapabilities.speak, returns: returnsFor(pramaanServedCapabilities.speak), lifecycle: "immediate", handler: immediate(pramaanServedCapabilities.speak), capacity: "audio.speech" , transient: true },
      { capability: pramaanServedCapabilities.soundEffect, returns: returnsFor(pramaanServedCapabilities.soundEffect), lifecycle: "immediate", handler: immediate(pramaanServedCapabilities.soundEffect), capacity: "audio.sound-effects.generate" , transient: true },
      { capability: pramaanServedCapabilities.soundtrack, returns: returnsFor(pramaanServedCapabilities.soundtrack), lifecycle: "immediate", handler: immediate(pramaanServedCapabilities.soundtrack), capacity: "audio.soundtrack.generate" , transient: true },
      { capability: pramaanServedCapabilities.voiceDesign, returns: returnsFor(pramaanServedCapabilities.voiceDesign), lifecycle: "immediate", handler: immediate(pramaanServedCapabilities.voiceDesign), capacity: "audio.speech" , transient: true },
      { capability: pramaanServedCapabilities.alignment, returns: returnsFor(pramaanServedCapabilities.alignment), lifecycle: "immediate", handler: immediate(pramaanServedCapabilities.alignment), capacity: "audio.transcribe-configured" },
    ],
  });
}

/** Flattens segment-level word timings into one word array. */
function flattenSegmentWords(segments: unknown): unknown[] {
  if (!Array.isArray(segments)) return [];
  return segments.flatMap((segment) =>
    typeof segment === "object" && segment !== null && Array.isArray((segment as { words?: unknown }).words)
      ? (segment as { words: unknown[] }).words : []);
}
