import { blobTypes } from "@hypit/hypit/blob";
import { sealGenerationPortRequest, sealGenerationRequestDraft, sealGenerationPortTable } from "@hypit/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@hypit/generation";
import type { SurfaceAttributeVocabulary, SurfaceChildVocabulary } from "@hypit/hypit/markup";
import { defineExactModelModule } from "@hypit/generation/model";
import { textTypes } from "@hypit/hypit/text";

export const videoFamilyModuleRef = { name: "@hypit/video-family", version: "1" } as const;

/** The video family's one capability: one generation request, Pramaan routes it. */
export const videoFamilyCapability = "generate";

const ASPECT_RATIOS = ["auto", "adaptive", "1:1", "2:3", "3:2", "4:3", "3:4", "16:9", "9:16", "21:9"] as const;

function table(): GenerationPortTable {
  return sealGenerationPortTable({
    model: videoFamilyCapability,
    result: "video",
    ports: [
      { name: "prompt", value: { kind: "text", maxChars: 30_000 }, minItems: 1, maxItems: 1 },
      { name: "firstFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
      { name: "lastFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
      { name: "referenceImages", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 9 },
      { name: "referenceVideos", value: { kind: "media", accepts: ["video"] }, minItems: 0, maxItems: 3 },
      { name: "referenceAudio", value: { kind: "media", accepts: ["audio"] }, minItems: 0, maxItems: 3 },
      { name: "resolution", value: { kind: "enum", values: ["480p", "720p", "1080p", "4k"] }, minItems: 1, maxItems: 1 },
      { name: "aspectRatio", value: { kind: "enum", values: [...ASPECT_RATIOS] }, minItems: 1, maxItems: 1 },
      { name: "duration", value: { kind: "number", integer: true, minimum: -1, maximum: 20 }, minItems: 0, maxItems: 1 },
      { name: "generateAudio", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
    ],
    requires: [
      { kind: "atMostOneOf", ports: ["referenceImages", "firstFrame"] },
      { kind: "atMostOneOf", ports: ["referenceVideos", "firstFrame"] },
      { kind: "atMostOneOf", ports: ["referenceAudio", "firstFrame"] },
      { kind: "requiresPresent", port: "lastFrame", needs: ["firstFrame"] },
    ],
  });
}

export const videoFamilyPorts: GenerationPortTable = table();

export function sealVideoFamilyRequest(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(videoFamilyPorts, ports);
}

export function sealVideoFamilyRequestDraft(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
) {
  return sealGenerationRequestDraft(videoFamilyPorts, ports);
}

const base = defineExactModelModule({
  module: videoFamilyModuleRef,
  endpoints: ([
    ["video", videoFamilyCapability, "VideoFamilyGenerateRequest"],
  ] as const).map(([key, model, requestTypeName]) => ({
    key,
    requestTypeName,
    producerName: `request-${model}`,
    ports: videoFamilyPorts,
  })),
});

export const videoFamilyEndpoints = base.endpoints;
export const videoFamilyComponent = base.component;

const attributes: readonly SurfaceAttributeVocabulary[] = [
  { name: "id", kind: "identifier", required: true,
    summary: "Names this generation and prefixes the bindings it publishes." },
  { name: "prompt", kind: "reference", required: true, accepts: [textTypes.text],
    summary: "The Text edge describing the footage." },
  { name: "aspect-ratio", kind: "literal", required: true, values: [...ASPECT_RATIOS],
    summary: "The shape of the generated footage." },
  { name: "resolution", kind: "literal", required: true, values: ["480p", "720p", "1080p", "4k"],
    summary: "The size band the footage renders at." },
  { name: "duration", kind: "literal", required: false,
    summary: "Seconds of footage; a whole number, or -1 to let the service choose." },
  { name: "generate-audio", kind: "literal", required: false, values: ["true", "false"],
    summary: "Whether the footage carries generated sound." },
  { name: "first-frame", kind: "reference", required: false, accepts: [blobTypes.blob],
    summary: "The image Artifact the footage starts from." },
  { name: "last-frame", kind: "reference", required: false, accepts: [blobTypes.blob],
    summary: "The image Artifact the footage ends on; needs first-frame." },
];

const children: readonly SurfaceChildVocabulary[] = [
  { tag: "Reference", cardinality: "many",
    summary: "Attaches one image, video or audio Artifact as generation reference.",
    attributes: [
      { name: "image", kind: "reference", required: false, accepts: [blobTypes.blob],
        summary: "Selects the image Artifact this reference contributes." },
      { name: "video", kind: "reference", required: false, accepts: [blobTypes.blob],
        summary: "Selects the video Artifact this reference contributes." },
      { name: "audio", kind: "reference", required: false, accepts: [blobTypes.blob],
        summary: "Selects the audio Artifact this reference contributes." },
    ] },
];

const surface = (
  name: string,
  tag: string,
  summary: string,
  example: string,
) => ({
  name,
  tag,
  mode: "structured" as const,
  outputs: [
    base.endpoints.video!.draftType,
    ...Object.values(base.endpoints.video!.mediaBindings).map((binding) => binding.type),
  ],
  vocabulary: {
    summary,
    attributes,
    children,
    ports: [{
      name: "video",
      type: blobTypes.blob,
      summary: "The generated footage, addressed as `<id>.video`.",
    }],
    example,
    notes: [
      "A first-frame element starts the footage from a picture; references must not repeat it.",
      "Every reference is an ordinary Artifact edge; the Surface copies no runtime media into request metadata.",
      "The Surface lowers the element into the family's generation request; Pramaan picks the route.",
    ],
  },
});

export const videoFamilyMarkupSurfaces = [
  surface("video", "Video",
    "Generates one clip from a Text prompt, optional first and last frames and references.",
    `<vid:Video
  id="a-roll"
  prompt={shotPrompt}
  aspect-ratio="9:16"
  resolution="720p"
  duration={8}
  generate-audio="true"
>
  <vid:Reference image={host.image}/>
</vid:Video>`),
  surface("text-video", "TextVideo",
    "Generates one clip from a Text prompt and references (earlier spelling of Video).",
    `<vid:TextVideo id="a-roll" prompt={shotPrompt} aspect-ratio="9:16" resolution="720p"/>`),
  surface("frame-video", "FrameVideo",
    "Generates one clip from a first picture, a Text prompt and references (earlier spelling of Video).",
    `<vid:FrameVideo id="a-roll" prompt={shotPrompt} aspect-ratio="9:16" resolution="720p" first-frame={host.image}/>`),
  surface("reference-video", "ReferenceVideo",
    "Generates one clip from a Text prompt and references (earlier spelling of Video).",
    `<vid:ReferenceVideo id="a-roll" prompt={shotPrompt} aspect-ratio="9:16" resolution="720p">
  <vid:Reference video={styleClip.video}/>
</vid:ReferenceVideo>`),
] as const;

export const videoFamilyManifest = {
  ...base.manifest,
};
export const videoFamilyDefinition = {
  ...base,
  manifest: videoFamilyManifest,
};
