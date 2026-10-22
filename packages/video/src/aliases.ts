/**
 * Legacy module names from earlier workflow files, mapped to the family packages that
 * replaced them. Old `<import from="...">` entries keep loading: the module resolves to
 * its family, which owns the same Surfaces under their earlier tag names. The names here
 * are data for loading old files only; nothing in the interface lists them.
 */
const LEGACY_MODULE_ALIASES: Readonly<Record<string, string>> = {
  "@hypit/seedance": "@hypit/video-family",
  "@hypit/seedance-kits": "@hypit/video-family",
  "@hypit/wan": "@hypit/video-family",
  "@hypit/pixverse": "@hypit/video-family",
  "@hypit/minimax-h3": "@hypit/video-family",
  "@hypit/grok-imagine": "@hypit/video-family",
  "@hypit/gpt-image": "@hypit/image-family",
  "@hypit/gpt-image-kits": "@hypit/image-family",
  "@hypit/nano-banana": "@hypit/image-family",
  "@hypit/seedream": "@hypit/image-family",
  "@hypit/elevenlabs-speech": "@hypit/voice-family",
  "@hypit/fishaudio-speech": "@hypit/voice-family",
  "@hypit/mimo-speech": "@hypit/voice-family",
  "@hypit/volcengine-matting": "@hypit/matting-family",
};

/** Strips an exact trailing version so `@hypit/seedance@1` aliases like the bare name. */
export function legacyModuleAlias(request: string): string | undefined {
  const name = request.replace(/@[0-9.]+$/u, "");
  return LEGACY_MODULE_ALIASES[name];
}
