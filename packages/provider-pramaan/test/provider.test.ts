import assert from "node:assert/strict";
import test from "node:test";

import { Cap } from "@hypit/pramaan";
import { FakePramaan } from "@hypit/pramaan/fake";
import type { BlobRef, CapabilityRef, TypeRef } from "@hypit/hypit/protocol";
import type { ImmediateEndpointHandler } from "@hypit/hypit/endpoint";
import { createPramaanProvider, pramaanServedCapabilities } from "../src/index.js";

const AUDIO_BYTES = new Uint8Array([1, 2, 3, 4]);

function fakeStore() {
  return {
    get: async (id: string) => { assert.ok(id.startsWith("res_")); return AUDIO_BYTES; },
    put: async (bytes: Uint8Array, mediaType: string): Promise<BlobRef> =>
      ({ kind: "blob", resource: "res_result", size: bytes.byteLength, mediaType }),
  };
}

function constraints(ports: Record<string, unknown>): unknown {
  return { ports };
}

function context(capability: CapabilityRef, ports: Record<string, unknown>): never {
  return {
    need: { capability, constraints: constraints(ports) },
    resources: fakeStore(),
    reportProgress: async () => {},
  } as never;
}

function key(capability: CapabilityRef): string {
  return `${capability.module.name}#${capability.name}`;
}

function installed(provider: ReturnType<typeof createPramaanProvider>) {
  const immediate = new Map<string, ImmediateEndpointHandler>();
  const asyncs = new Map<string, { start(c: never): Promise<{ status: string; handle?: unknown }>; poll(c: never): Promise<{ status: string; handle?: unknown }>; collect(c: never): Promise<{ status: string; result?: unknown }> }>();
  const returns = new Map<string, TypeRef>();
  provider.install({
    registerImmediateEndpoint: (_id: string, capability: CapabilityRef, returnsRef: TypeRef, handler: ImmediateEndpointHandler) => {
      immediate.set(key(capability), handler);
      returns.set(key(capability), returnsRef);
    },
    registerAsyncEndpoint: (_id: string, capability: CapabilityRef, returnsRef: TypeRef, endpoint: unknown) => {
      asyncs.set(key(capability), endpoint as never);
      returns.set(key(capability), returnsRef);
    },
  } as never);
  return { immediate, asyncs, returns };
}

test("Speak maps onto the speech capability and packages the spoken audio", async () => {
  const fake = new FakePramaan({
    [Cap.audioSpeech]: () => ({ audioUrl: "https://files.test/line.mp3", fileId: "f_1", expiresAt: "x" }),
  });
  fake.raw.download = async (url: string) => {
    assert.equal(url, "https://files.test/line.mp3");
    return AUDIO_BYTES;
  };
  const { immediate, returns } = installed(createPramaanProvider({ client: fake }));
  const handler = immediate.get(key(pramaanServedCapabilities.speak));
  assert.ok(handler !== undefined);
  const fulfilled = await handler(context(pramaanServedCapabilities.speak, {
    text: ["hello there"], voice: ["a warm female narrator"],
  }));
  assert.deepEqual(fake.callsTo(Cap.audioSpeech), [{ text: "hello there", voice: "female" }]);
  assert.deepEqual(fulfilled.value, {
    kind: "inline",
    value: { audios: [{ kind: "blob", resource: "res_result", size: 4, mediaType: "audio/mpeg" }] },
  });
  assert.ok(returns.get(key(pramaanServedCapabilities.speak)) !== undefined);
});

test("Voice design from a recording clones, then speaks with the kept voice", async () => {
  const fake = new FakePramaan({
    [Cap.voiceClone]: () => ({ ref: "voice_cloned" }),
    [Cap.audioSpeech]: () => ({ audioUrl: "https://files.test/line.mp3", fileId: "f_1", expiresAt: "x" }),
  });
  fake.uploadFile = async (_bytes, kind) => {
    assert.equal(kind, "audio");
    return { fileId: "f_voice" };
  };
  fake.raw.download = async () => AUDIO_BYTES;
  const { immediate } = installed(createPramaanProvider({ client: fake }));
  const handler = immediate.get(key(pramaanServedCapabilities.voiceDesign));
  assert.ok(handler !== undefined);
  await handler(context(pramaanServedCapabilities.voiceDesign, {
    text: ["hello there"],
    voiceReference: [{ role: "audio", artifact: { resource: "res_voice", size: 4, mediaType: "audio/wav" } }],
  }));
  const clone = fake.callsTo(Cap.voiceClone)[0] as { name: string; samples: unknown };
  assert.ok(clone.name.startsWith("voice-"));
  assert.deepEqual(clone.samples, [{ fileId: "f_voice" }]);
  assert.deepEqual(fake.callsTo(Cap.audioSpeech), [{ text: "hello there", voice: "voice_cloned" }]);
  const cloneCall = fake.calls.find((entry) => entry.id === Cap.voiceClone);
  assert.ok(typeof cloneCall?.opts?.idempotencyKey === "string" && cloneCall.opts.idempotencyKey.length > 0);
});

test("Video generation submits a mapped job and the endpoint polls it to completion", async () => {
  const fake = new FakePramaan({});
  const runs: { id: string; input: unknown }[] = [];
  fake.raw.run = async (id: string, input: unknown) => {
    runs.push({ id, input });
    return { id: "job_9", capability: id, status: "running" };
  };
  let polls = 0;
  fake.raw.jobs.get = async (id: string) => {
    assert.equal(id, "job_9");
    polls += 1;
    if (polls === 1) return { id, capability: Cap.videoGenerate, status: "running" };
    return { id, capability: Cap.videoGenerate, status: "done", result: { videos: [{ url: "https://files.test/clip.mp4" }] } };
  };
  fake.raw.download = async () => AUDIO_BYTES;
  const { asyncs } = installed(createPramaanProvider({ client: fake, pollIntervalMs: 1 }));
  const endpoint = asyncs.get(key(pramaanServedCapabilities.videoGenerate));
  assert.ok(endpoint !== undefined);
  const started = await endpoint.start(context(pramaanServedCapabilities.videoGenerate, {
    prompt: ["a two-shot interview"],
    aspectRatio: ["9:16"],
    resolution: ["720p"],
    duration: [8],
  }));
  assert.equal(started.status, "pending");
  assert.deepEqual(runs, [{
    id: Cap.videoGenerate,
    input: { prompt: "a two-shot interview", aspect: "portrait", quality: "best", durationSeconds: 8 },
  }]);
  let handle = started.handle;
  for (;;) {
    const polled = await endpoint.poll({ handle, need: { capability: pramaanServedCapabilities.videoGenerate } } as never);
    if (polled.status !== "pending") { assert.equal(polled.status, "ready"); break; }
    handle = polled.handle;
  }
  const collected = await endpoint.collect({ handle, resources: fakeStore(), need: { capability: pramaanServedCapabilities.videoGenerate } } as never);
  assert.equal(collected.status, "completed", JSON.stringify(collected));
  assert.ok(JSON.stringify(collected.result).includes("res_result"));
});

test("Run report pricing is the Pramaan estimate: a total with no source names", async () => {
  const fake = new FakePramaan({});
  fake.raw.capabilities.get = async (id: string) => ({
    id, description: "estimate", effectClass: "read_only", mode: "async", needsConnection: false,
    priceEstimateMicro: 41_000, example: null, requestSchema: {}, resultSchema: {},
  });
  const provider = createPramaanProvider({ client: fake });
  assert.ok(provider.readPricing !== undefined);
  const documents = await provider.readPricing({ request: { capability: pramaanServedCapabilities.videoGenerate } } as never);
  assert.deepEqual(documents, [{ source: "pramaan-estimate", data: { total: 41_000, canRun: true } }]);
});

test("The alignment capability transcribes with word timings", async () => {
  const fake = new FakePramaan({
    [Cap.audioModelsList]: () => ({ results: [{ ref: "stored-model", quality: "standard", batch: true, languages: ["en"] }] }),
    [Cap.audioTranscribeConfigured]: () => ({
      transcript: { channels: [{ words: [
        { text: "hello", start: 0, end: 0.5 },
        { text: "world", start: 0.5, end: 1 },
      ] }] },
    }),
  });
  fake.uploadFile = async () => ({ fileId: "f_audio" });
  const { immediate } = installed(createPramaanProvider({ client: fake }));
  const handler = immediate.get(key(pramaanServedCapabilities.alignment));
  assert.ok(handler !== undefined);
  const fulfilled = await handler({
    need: { capability: pramaanServedCapabilities.alignment, constraints: {
      domainId: "dom_1",
      audio: { kind: "blob", resource: "res_audio", size: 4, mediaType: "audio/wav" },
      sampleFrames: 16_000,
      language: "en",
    } },
    resources: fakeStore(),
    reportProgress: async () => {},
  } as never);
  assert.deepEqual(fake.callsTo(Cap.audioTranscribeConfigured), [{ ref: "stored-model", fileId: "f_audio", channels: 1, language: "en", speakerLabels: false }]);
  const inline = fulfilled.value as { kind: string; value: { passages?: unknown[] } };
  assert.equal(inline.kind, "inline");
  assert.ok(Array.isArray(inline.value.passages) && inline.value.passages.length > 0);
});

test("The apiKey slot defaults to the environment variable and nothing else", () => {
  const provider = createPramaanProvider({ client: new FakePramaan({}) });
  assert.equal(provider.credentials.length, 1);
  assert.equal(provider.credentials[0]?.slot, "apiKey");
  assert.equal(provider.credentials[0]?.ref.store, "env");
  assert.equal(provider.credentials[0]?.ref.key, "PRAMAAN_API_KEY");
});
