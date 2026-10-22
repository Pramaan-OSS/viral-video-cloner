// The capabilities this product calls, with the traits the client needs offline: the retry
// decision reads effectClass. Every id is from the capabilities lab catalogue; nothing here is
// invented. Sync and offline: `info()` never touches the network.

import type { CapabilityInfo, EffectClass } from "./sdk/types.js";

type Entry = Pick<CapabilityInfo, "effectClass" | "mode" | "needsConnection"> & {
	readonly description: string;
};

function entry(
	effectClass: EffectClass,
	mode: "sync" | "async",
	description: string,
	needsConnection = false,
): Entry {
	return { effectClass, mode, needsConnection, description };
}

const CATALOG: Readonly<Record<string, Entry>> = {
	// Media generation.
	"video.generate": entry("read_only", "async", "Generate a short video clip from a text prompt."),
	"video.generate-configured": entry("read_only", "async", "Generate a clip with explicit length, framing, resolution and audio controls."),
	"video.generate-bulk": entry("read_only", "async", "Generate videos for up to 8 prompt rows as a job."),
	"image.generate": entry("read_only", "sync", "Generate 1-4 images from a text prompt."),
	"image.generate-configured": entry("read_only", "async", "Generate 1 to 4 images with explicit rendering controls."),
	"image.generate-bulk": entry("read_only", "async", "Generate images for up to 16 prompt rows as a job."),
	"image.edit": entry("read_only", "async", "Edit or combine 1 to 10 source images into 1 to 4 outputs."),
	"audio.speech": entry("read_only", "sync", "Turn text into spoken audio."),
	"audio.soundtrack.generate": entry("read_only", "async", "Generate sound effects and background music for a supplied video."),
	"audio.sound-effects.generate": entry("read_only", "async", "Make a sound effect from a written prompt."),
	// Alignment and transcription.
	"audio.models.list": entry("read_only", "sync", "List recognition models and their selection handles."),
	"audio.align": entry("read_only", "async", "Align supplied words to an uploaded voice recording, returning word times."),
	"audio.transcribe": entry("read_only", "sync", "Transcribe a public audio URL into text with timestamped segments."),
	"audio.transcribe-configured": entry("read_only", "sync", "Transcribe with a listed recognition model, timed words and speaker labels."),
	// Voice catalogue and voices.
	"audio.voice-catalog.list": entry("read_only", "sync", "List public voice names, languages, gender and supported controls."),
	"audio.voice.design": entry("external_reversible", "async", "Design a new voice from a written description; returns preview recordings."),
	"audio.voice.create": entry("external_reversible", "sync", "Keep a designed voice; its ref works in the other voice capabilities."),
	"audio.voice.clone": entry("external_reversible", "async", "Make a voice from recordings of a speaker."),
	"audio.voices.list": entry("read_only", "sync", "List the voices you created."),
	"audio.voice.delete": entry("external_irreversible", "sync", "Permanently delete one of your voices and the recordings it was made from."),
	// Image and video analysis and repair.
	"video.background.remove": entry("read_only", "async", "Remove the background from an uploaded video; output retains transparency."),
	"image.background.remove": entry("read_only", "async", "Remove the background from an uploaded image."),
	"video.faces.detect": entry("read_only", "async", "Detect visible faces in a supplied video with appearance times."),
	// Source videos.
	"media.video.download": entry("read_only", "sync", "Fetch a video by its public URL into platform storage, at most 25 MB. Needs platform file storage."),
	"tiktok.video.resolve": entry("read_only", "sync", "Turn the address of a TikTok video into its numeric id."),
	"tiktok.video.detail": entry("read_only", "sync", "Get one TikTok video's caption, author, date, counts, duration and thumbnail."),
	"tiktok.video.transcript": entry("read_only", "sync", "Get the spoken words of a TikTok video as text."),
	"youtube.video.detail": entry("read_only", "sync", "Get one YouTube video's title, description, channel, date, views and duration."),
	"youtube.video.transcript": entry("read_only", "sync", "Get the spoken words of a YouTube video as one text, with its language."),
	"instagram.post.resolve": entry("read_only", "sync", "Turn the address of an Instagram post into its shortcode."),
	"tiktok.feed.trending": entry("read_only", "sync", "The trending feed of a TikTok region."),
	"tiktok.trends.hashtags": entry("read_only", "sync", "Trending hashtags on TikTok."),
	"tiktok.search.videos": entry("read_only", "sync", "Search TikTok videos."),
	"youtube.search.videos": entry("read_only", "sync", "Search YouTube videos."),
	"youtube.search.shorts": entry("read_only", "sync", "Search YouTube Shorts."),
	"instagram.search.reels": entry("read_only", "sync", "Search Instagram reels."),
	"instagram.reels.trending": entry("read_only", "sync", "Trending Instagram reels."),
	// Text.
	"text.translate": entry("read_only", "sync", "Translate a text into a target language, with an optional source language and tone."),
	"llm.complete": entry("read_only", "sync", "Generate a text reply to a chat of system, user and assistant messages."),
	"llm.complete-bulk": entry("read_only", "async", "Generate text replies for up to 16 message rows as a job."),
};

export function capabilityInfo(id: string): CapabilityInfo | undefined {
	const row = CATALOG[id];
	if (row === undefined) return undefined;
	return {
		id,
		description: row.description,
		effectClass: row.effectClass,
		mode: row.mode,
		needsConnection: row.needsConnection,
	};
}
