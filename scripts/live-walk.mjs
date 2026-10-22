// Live walk driver: estimates first, then one call per paid family, against the
// live Pramaan API. Run with the real key in the environment (never committed):
//   node --env-file=.env --import tsx scripts/live-walk.mjs [family ...]
// Families: copy translate source image speech align download video music

import { createPramaan, Cap } from "../packages/pramaan/src/index.js";

const client = createPramaan({ apiKey: process.env.PRAMAAN_API_KEY ?? "" });
const spent = [];

async function estimate(id, input) {
  try {
    const estimate = await client.raw.capabilities.estimate(id, input);
    return estimate;
  } catch (error) {
    return { priceMaxMicro: -1, canRun: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

async function paid(name, id, input, run) {
  const quote = await estimate(id, input);
  const cents = quote.priceMaxMicro < 0 ? "estimate-failed" : (quote.priceMaxMicro / 1_000_000).toFixed(4);
  if (quote.priceMaxMicro > 500_000) {
    console.log(`SKIP ${name} (${id}): estimate $${(quote.priceMaxMicro / 1_000_000).toFixed(3)} is over the $0.50 gate; asking the orchestrator.`);
    spent.push([name, id, cents, "skipped over $0.50"]);
    return undefined;
  }
  if (quote.canRun === false && quote.reason !== undefined) {
    console.log(`UNAVAILABLE ${name} (${id}): ${quote.reason}`);
    spent.push([name, id, cents, `unavailable: ${quote.reason}`]);
    return undefined;
  }
  console.log(`RUN ${name} (${id}) estimate $${cents}`);
  try {
    const result = await run();
    console.log(`OK   ${name}`);
    spent.push([name, id, cents, "ok"]);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAIL ${name}: ${message.slice(0, 220)}`);
    spent.push([name, id, cents, `failed: ${message.slice(0, 120)}`]);
    return undefined;
  }
}

function pick(value, path) {
  let current = value;
  for (const key of path.split(".")) {
    current = current === null || typeof current !== "object" ? undefined : current[key];
  }
  return current;
}

const only = process.argv.slice(2);
const want = (family) => only.length === 0 || only.includes(family);

// ── Hook copy: llm.complete ─────────────────────────────────────────────────
let hookLine;
if (want("copy")) {
  const result = await paid("hook copy", Cap.llmComplete, {
    messages: [
      { role: "system", content: "You write one short spoken hook line for a short vertical video. Answer with the line only." },
      { role: "user", content: "A hook for a video ranking the most ridiculous football takes, host on camera, first five seconds." },
    ],
  }, async () => {
    const reply = await client.copyComplete({
      messages: [
        { role: "system", content: "You write one short spoken hook line for a short vertical video. Answer with the line only." },
        { role: "user", content: "A hook for a video ranking the most ridiculous football takes, host on camera, first five seconds." },
      ],
    });
    return reply;
  });
  hookLine = pick(result, "text") ?? pick(result, "content") ?? (typeof result === "string" ? result : undefined);
  console.log("hook:", hookLine);
}

// ── Translation: text.translate ─────────────────────────────────────────────
if (want("translate")) {
  const result = await paid("translate", Cap.textTranslate, {
    text: "Welcome back. Today we are ranking the most ridiculous football takes.",
    targetLanguage: "es",
  }, () => client.translate({ text: "Welcome back. Today we are ranking the most ridiculous football takes.", targetLanguage: "es" }));
  console.log("translation:", pick(result, "translatedText") ?? pick(result, "text") ?? result);
}

// ── Source analysis: youtube detail + transcript ────────────────────────────
if (want("source")) {
  // The lab's own live verification used this video id.
  await paid("source detail", Cap.youtubeVideoDetail, { videoId: "jNQXAC9IVRw" },
    () => client.youtubeDetail({ videoId: "jNQXAC9IVRw" }));
  await paid("source transcript", Cap.youtubeVideoTranscript, { url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" },
    () => client.youtubeTranscript({ url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" }));
}

// ── Image generate ──────────────────────────────────────────────────────────
if (want("image")) {
  const result = await paid("image generate", Cap.imageGenerate, {
    prompt: "A small red chair against a quiet blue wall, product photo, soft light.",
    size: "square",
    count: 1,
  }, () => client.generateImage({ prompt: "A small red chair against a quiet blue wall, product photo, soft light.", size: "square", count: 1 }));
  const image = pick(result, "images.0.url");
  console.log("image url:", image ?? "(none)");
}

// ── Speech, then alignment on the spoken result ─────────────────────────────
let spoken;
if (want("speech")) {
  spoken = await paid("speech", Cap.audioSpeech, {
    text: "Welcome back. Today we are ranking the most ridiculous football takes.",
    voice: "neutral",
    format: "wav",
  }, () => client.speak({ text: "Welcome back. Today we are ranking the most ridiculous football takes.", voice: "neutral", format: "wav" }));
  console.log("speech url:", pick(spoken, "audioUrl") ?? "(none)");
}

if (want("align") && spoken !== undefined) {
  const url = pick(spoken, "audioUrl");
  const bytes = url === undefined ? undefined : await client.download(url).catch(() => undefined);
  if (bytes === undefined || bytes.byteLength === 0) {
    console.log("FAIL align: no spoken audio to align");
    spent.push(["align", Cap.audioAlign, "-", "no spoken audio"]);
  } else {
    const { fileId } = await client.uploadFile(bytes, "audio");
    // The provider's alignment path: transcribe with word timings.
    const models = await paid("recognition models", Cap.audioModelsList, { language: "en" },
      () => client.call(Cap.audioModelsList, { language: "en" }));
    const model = models?.results?.find((row) => row.batch && row.quality === "standard" && row.ref);
    if (model) {
      const input = { ref: model.ref, fileId, language: "en", channels: 1 };
      await paid("alignment", Cap.audioTranscribeConfigured, input,
        () => client.transcribeConfigured(input));
    } else console.log("ALIGN BLOCKED: no compatible recognition model reference");
  }
}

// ── URL download: expected to be unavailable until platform file storage ────
if (want("download")) {
  await paid("url download", Cap.mediaVideoDownload, { url: "https://www.tiktok.com/@scout2015/video/6718335390845095173" },
    () => client.downloadSourceVideo({ url: "https://www.tiktok.com/@scout2015/video/6718335390845095173" }));
}

// ── Video generation and music: expected unavailable; estimates only ────────
if (want("video")) {
  const quote = await estimate(Cap.videoGenerate, { prompt: "A paper boat crossing a rain puddle, 9:16." });
  console.log(`video generate estimate: ${quote.priceMaxMicro < 0 ? "estimate failed" : `$${(quote.priceMaxMicro / 1_000_000).toFixed(3)}`} canRun=${quote.canRun} ${quote.reason ?? ""}`);
  spent.push(["video generate", Cap.videoGenerate, quote.priceMaxMicro / 1_000_000, quote.canRun ? "estimated only" : "unavailable"]);
}
if (want("music")) {
  const quote = await estimate(Cap.soundtrackGenerate, { musicPrompt: "light playful ukulele" });
  console.log(`soundtrack estimate: ${quote.priceMaxMicro < 0 ? "estimate failed" : `$${(quote.priceMaxMicro / 1_000_000).toFixed(3)}`} canRun=${quote.canRun} ${quote.reason ?? ""}`);
  spent.push(["soundtrack", Cap.soundtrackGenerate, quote.priceMaxMicro / 1_000_000, quote.canRun ? "estimated only" : "unavailable"]);
}

console.log("\n─ live walk summary ─");
let total = 0;
for (const [name, id, cents, outcome] of spent) {
  const value = Number.isFinite(Number(cents)) ? Number(cents) : 0;
  total += value;
  console.log(`${name.padEnd(18)} ${String(id).padEnd(34)} est $${cents}  ${outcome}`);
}
console.log(`estimated total: $${total.toFixed(4)} (estimates are upper bounds)`);
