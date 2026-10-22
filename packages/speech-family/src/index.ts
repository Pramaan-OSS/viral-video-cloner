import { blobTypes } from "@hypit/hypit/blob";
import { sealGenerationPortRequest, sealGenerationRequestDraft, sealGenerationPortTable } from "@hypit/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@hypit/generation";
import type { SurfaceAttributeVocabulary, SurfaceChildVocabulary } from "@hypit/hypit/markup";
import { defineExactModelModule } from "@hypit/generation/model";
import { textTypes } from "@hypit/hypit/text";

export const speechFamilyModuleRef = { name: "@hypit/speech-family", version: "1" } as const;

/** Capability names of the speech family: spoken lines, sound effects and soundtrack. */
export const speechFamilyCapabilities = {
  speak: "speak",
  soundEffect: "sound-effect",
  soundtrack: "soundtrack",
} as const;

const spokenText = { kind: "text", maxChars: 3000 } as const;
const promptText = { kind: "text", maxChars: 2000 } as const;

function speakTable(): GenerationPortTable {
  return sealGenerationPortTable({
    model: speechFamilyCapabilities.speak,
    result: "audio",
    ports: [
      { name: "text", value: spokenText, minItems: 1, maxItems: 1 },
      { name: "voice", value: { kind: "text", maxChars: 1000 }, minItems: 0, maxItems: 1 },
      { name: "instruction", value: { kind: "text", maxChars: 1000 }, minItems: 0, maxItems: 1 },
    ],
    requires: [],
  });
}

function soundEffectTable(): GenerationPortTable {
  return sealGenerationPortTable({
    model: speechFamilyCapabilities.soundEffect,
    result: "audio",
    ports: [
      { name: "prompt", value: promptText, minItems: 1, maxItems: 1 },
    ],
    requires: [],
  });
}

function soundtrackTable(): GenerationPortTable {
  return sealGenerationPortTable({
    model: speechFamilyCapabilities.soundtrack,
    result: "audio",
    ports: [
      { name: "prompt", value: promptText, minItems: 1, maxItems: 1 },
      { name: "video", value: { kind: "media", accepts: ["video"] }, minItems: 0, maxItems: 1 },
    ],
    requires: [],
  });
}

export const speechFamilyPorts: Readonly<Record<keyof typeof speechFamilyCapabilities, GenerationPortTable>> = {
  speak: speakTable(),
  soundEffect: soundEffectTable(),
  soundtrack: soundtrackTable(),
};

export function sealSpeechFamilyRequest(
  capability: keyof typeof speechFamilyCapabilities,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(speechFamilyPorts[capability], ports);
}

export function sealSpeechFamilyRequestDraft(
  capability: keyof typeof speechFamilyCapabilities,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
) {
  return sealGenerationRequestDraft(speechFamilyPorts[capability], ports);
}

const base = defineExactModelModule({
  module: speechFamilyModuleRef,
  endpoints: ([
    ["speak", "speak", "SpeechFamilySpeakRequest"],
    ["sound-effect", "soundEffect", "SpeechFamilySoundEffectRequest"],
    ["soundtrack", "soundtrack", "SpeechFamilySoundtrackRequest"],
  ] as const).map(([key, portsKey, requestTypeName]) => ({
    key,
    requestTypeName,
    producerName: `request-${speechFamilyCapabilities[portsKey]}`,
    ports: speechFamilyPorts[portsKey],
  })),
});

export const speechFamilyEndpoints = base.endpoints;
export const speechFamilyComponent = base.component;

const speakAttributes: readonly SurfaceAttributeVocabulary[] = [
  { name: "id", kind: "identifier", required: true,
    summary: "Names this line and prefixes the bindings it publishes." },
  { name: "speech", kind: "reference", required: true, accepts: [textTypes.text],
    summary: "The Text edge with the words that are spoken." },
  { name: "voice", kind: "reference", required: false, accepts: [textTypes.text],
    summary: "The Text edge naming the voice, or a voice kept with the voice family." },
];

const soundAttributes: readonly SurfaceAttributeVocabulary[] = [
  { name: "id", kind: "identifier", required: true,
    summary: "Names this audio and prefixes the bindings it publishes." },
  { name: "prompt", kind: "reference", required: true, accepts: [textTypes.text],
    summary: "The Text edge describing the audio." },
];

const noChildren: readonly SurfaceChildVocabulary[] = [];

const videoChild: readonly SurfaceChildVocabulary[] = [
  { tag: "Reference", cardinality: "many",
    summary: "Attaches the video the soundtrack is written against.",
    attributes: [
      { name: "video", kind: "reference", required: true, accepts: [blobTypes.blob],
        summary: "Selects the video Artifact this reference contributes." },
    ] },
];

const surface = (
  name: string,
  tag: string,
  endpoint: keyof typeof speechFamilyEndpoints,
  attributes: readonly SurfaceAttributeVocabulary[],
  children: readonly SurfaceChildVocabulary[],
  outputs: string,
  summary: string,
  example: string,
) => ({
  name,
  tag,
  mode: "structured" as const,
  outputs: [
    speechFamilyEndpoints[endpoint]!.draftType,
    ...Object.values(speechFamilyEndpoints[endpoint]!.mediaBindings).map((binding) => binding.type),
  ],
  vocabulary: {
    summary,
    attributes,
    children,
    ports: [{
      name: "audio",
      type: blobTypes.blob,
      summary: `${outputs}, addressed as \`<id>.audio\`.`,
    }],
    example,
    notes: [
      "The Surface lowers the element into the family's request; Pramaan picks the route.",
    ],
  },
});

export const speechFamilyMarkupSurfaces = [
  surface("speak", "Speak", "speak", speakAttributes, noChildren, "The spoken line",
    "Speaks one passage with a named or described voice.",
    `<say:Speak id="line-1" speech={line1} voice={narratorVoice}/>`),
  surface("sound-effect", "SoundEffect", "sound-effect", soundAttributes, noChildren, "The sound effect",
    "Generates one sound effect from a written prompt.",
    `<say:SoundEffect id="whoosh" prompt={whooshPrompt}/>`),
  surface("soundtrack", "Soundtrack", "soundtrack", soundAttributes, videoChild, "The soundtrack",
    "Generates background music and effects for a supplied video.",
    `<say:Soundtrack id="bgm" prompt={musicPrompt}>
  <say:Reference video={cut.video}/>
</say:Soundtrack>`),
] as const;

export const speechFamilyManifest = {
  ...base.manifest,
};
export const speechFamilyDefinition = {
  ...base,
  manifest: speechFamilyManifest,
};
