import assert from "node:assert/strict";
import test from "node:test";

import {
  Cap,
  createPramaan,
  idempotencyKey,
  pramaanFromEnv,
  type Pramaan,
} from "../src/index.js";
import { FakePramaan } from "../src/fake.js";

function pramaanFromEnvForTest(): Pramaan | null {
  return pramaanFromEnv();
}

test("FakePramaan routes a family helper to its capability id", async () => {
  const fake = new FakePramaan({
    [Cap.imageGenerate]: (input) => ({ images: [{ url: "https://files.test/a.png" }], input }),
    [Cap.audioSpeech]: () => ({ url: "https://files.test/line.mp3" }),
  });
  const images = await fake.generateImage({ prompt: "a goth girl portrait" });
  assert.ok(Array.isArray((images as { images: unknown[] }).images));
  await fake.speak({ text: "welcome back", voice: "warm narrator" });
  assert.deepEqual(fake.callsTo(Cap.audioSpeech), [{ text: "welcome back", voice: "warm narrator" }]);
});

test("FakePramaan refuses an external voice call without an Idempotency-Key", async () => {
  const fake = new FakePramaan({ [Cap.voiceCreate]: () => ({ ref: "voice_1" }) });
  await assert.rejects(
    () => fake.createVoice({ ref: "preview_1", name: "narrator" }),
    (error: { code?: string }) => error.code === "invalid_request",
  );
  const kept = await fake.createVoice({ ref: "preview_1", name: "narrator" }, { idempotencyKey: idempotencyKey() });
  assert.deepEqual(kept, { ref: "voice_1" });
});

test("FakePramaan fails loudly on an unrouted capability", async () => {
  const fake = new FakePramaan({});
  await assert.rejects(
    () => fake.translate({ text: "hola", targetLanguage: "en" }),
    /no route for "text.translate"/,
  );
});

test("The estimate route feeds run reports without running anything", async () => {
  let estimateCalls = 0;
  const fake = new FakePramaan({});
  fake.route({
    [Cap.videoGenerate]: () => { throw new Error("must not run"); },
  });
  fake.raw.capabilities.estimate = async () => {
    estimateCalls += 1;
    return { priceMaxMicro: 41_000, balanceMicro: 5_000_000, canRun: true };
  };
  const estimate = await fake.estimateFor(Cap.videoGenerate, { prompt: "a two-shot interview" });
  assert.equal(estimateCalls, 1);
  assert.equal(estimate.priceMaxMicro, 41_000);
  assert.equal(estimate.canRun, true);
});

test("pramaanFromEnv reads the key once and honours the fake switch", async () => {
  const previousKey = process.env.PRAMAAN_API_KEY;
  const previousFake = process.env.PRAMAAN_FAKE;
  try {
    delete process.env.PRAMAAN_API_KEY;
    assert.equal(pramaanFromEnvForTest(), null);
    process.env.PRAMAAN_API_KEY = "  test-key  ";
    const client = pramaanFromEnvForTest();
    assert.ok(client !== null);
    process.env.PRAMAAN_FAKE = "1";
    const offline = pramaanFromEnvForTest();
    assert.ok(offline !== null);
    await assert.rejects(
      () => offline.call(Cap.textTranslate, { text: "hi", targetLanguage: "fr" }),
      /Could not reach the Pramaan API/,
    );
  } finally {
    if (previousKey === undefined) delete process.env.PRAMAAN_API_KEY; else process.env.PRAMAAN_API_KEY = previousKey;
    if (previousFake === undefined) delete process.env.PRAMAAN_FAKE; else process.env.PRAMAAN_FAKE = previousFake;
  }
});

test("The real client sends the bearer key and the idempotency header", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const client: Pramaan = createPramaan({
    apiKey: "k-test",
    fetch: async (url, init) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ translatedText: "bonjour" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const result = await client.translate({ text: "hello", targetLanguage: "fr" }, { idempotencyKey: "fixed-key" });
  assert.deepEqual(result, { translatedText: "bonjour" });
  assert.equal(seen.length, 1);
  assert.match(seen[0]!.url, /\/v1\/capabilities\/text\.translate$/);
  assert.equal(new Headers(seen[0]!.init.headers).get("Authorization"), "Bearer k-test");
  assert.equal(new Headers(seen[0]!.init.headers).get("Idempotency-Key"), "fixed-key");
});

test("file uploads surface a clear not-found when the API does not serve /v1/files yet", async () => {
  const client: Pramaan = createPramaan({
    apiKey: "k-test",
    fetch: async (url) => new Response(JSON.stringify({ error: { code: "not_found", message: "Not found." } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    }),
  });
  await assert.rejects(
    () => client.uploadFile(new Uint8Array([1]), "audio"),
    (error: { code?: string; message?: string }) => error.code === "not_found",
  );
  assert.equal(await client.filesAvailable(), false);
});

test("the estimate route precedes every paid family call without running it", async () => {
  let paidCalls = 0;
  const fake = new FakePramaan({});
  fake.raw.capabilities.estimate = async (id: string) => ({
    priceMaxMicro: 4_000, balanceMicro: 1_000_000, canRun: true,
    id, description: "estimate", effectClass: "read_only", mode: "sync", needsConnection: false,
    example: null, requestSchema: {}, resultSchema: {},
  });
  fake.route({ [Cap.imageGenerate]: () => { paidCalls += 1; return { images: [] }; } });
  const estimate = await fake.estimateFor(Cap.imageGenerate, { prompt: "a chair" });
  assert.equal(estimate.priceMaxMicro, 4_000);
  assert.equal(paidCalls, 0, "estimating never runs the capability");
});

test("does not repeat a service refusal marked non-retryable", async () => {
  let calls = 0;
  const client = createPramaan({ apiKey: "test", fetch: async () => {
    calls++;
    return new Response(JSON.stringify({ error: {
      code: "upstream_unavailable", message: "Unavailable", retryable: false,
    } }), { status: 502 });
  }, sleep: async () => {} });
  await assert.rejects(() => client.generateImage({ prompt: "chair" }), /Unavailable/);
  assert.equal(calls, 1);
});

test("uploads alignment WAV bytes with an accepted audio content type", async () => {
  const bytes = new TextEncoder().encode("RIFF0000WAVEfmt ");
  const client = createPramaan({ apiKey: "test", fetch: async (url, init) => {
    assert.match(url, /\/v1\/files\?kind=audio$/);
    assert.equal((init.headers as Record<string, string>)["Content-Type"], "audio/wav");
    assert.deepEqual(new Uint8Array(init.body as ArrayBuffer), bytes);
    return Response.json({ fileId: "stored-audio" }, { status: 201 });
  } });
  assert.deepEqual(await client.uploadFile(bytes, "audio"), { fileId: "stored-audio" });
});


test("a retry reservation conflict keeps the original refusal", async () => {
  let requests = 0;
  const client = createPramaan({ apiKey: "fake", sleep: async () => {}, fetch: async () => {
    requests++;
    return Response.json({ error: { code: requests === 1 ? "upstream_unavailable" : "conflict", message: requests === 1 ? "Original refusal" : "Reservation still held", retryable: true } }, { status: requests === 1 ? 503 : 409 });
  } });
  await assert.rejects(() => client.translate({ text: "hello", targetLanguage: "fr" }), /Original refusal/);
  assert.equal(requests, 2);
});
