import { blobTypes } from "@hypit/hypit/blob";
import { sealGenerationPortRequest, sealGenerationRequestDraft, sealGenerationPortTable } from "@hypit/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@hypit/generation";
import type { SurfaceAttributeVocabulary, SurfaceChildVocabulary } from "@hypit/hypit/markup";
import { defineExactModelModule } from "@hypit/generation/model";
import { textTypes } from "@hypit/hypit/text";

export const voiceFamilyModuleRef = { name: "@hypit/voice-family", version: "1" } as const;

/**
 * The voice family's one capability: speak a passage with a voice the description names, a
 * recording carries, or a voice kept earlier through the Pramaan voice tools.
 */
export const voiceFamilyCapability = "design";

const spokenText = { kind: "text", maxChars: 1000 } as const;
const instruction = { kind: "text", maxChars: 1000 } as const;

function table(): GenerationPortTable {
  return sealGenerationPortTable({
    model: voiceFamilyCapability,
    result: "audio",
    ports: [
      { name: "text", value: spokenText, minItems: 1, maxItems: 1 },
      { name: "voiceDescription", value: instruction, minItems: 0, maxItems: 1 },
      { name: "voiceReference", value: { kind: "media", accepts: ["audio"] }, minItems: 0, maxItems: 1 },
      { name: "instruction", value: { kind: "text", maxChars: 1000 }, minItems: 0, maxItems: 1 },
    ],
    requires: [],
  });
}

export const voiceFamilyPorts: GenerationPortTable = table();

export function sealVoiceFamilyRequest(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(voiceFamilyPorts, ports);
}

export function sealVoiceFamilyRequestDraft(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
) {
  return sealGenerationRequestDraft(voiceFamilyPorts, ports);
}

const base = defineExactModelModule({
  module: voiceFamilyModuleRef,
  endpoints: ([
    ["design", voiceFamilyCapability, "VoiceFamilyDesignRequest"],
  ] as const).map(([key, model, requestTypeName]) => ({
    key,
    requestTypeName,
    producerName: `request-${model}`,
    ports: voiceFamilyPorts,
  })),
});

export const voiceFamilyEndpoints = base.endpoints;
export const voiceFamilyComponent = base.component;

const attributes: readonly SurfaceAttributeVocabulary[] = [
  { name: "id", kind: "identifier", required: true,
    summary: "Names this line and prefixes the bindings it publishes." },
  { name: "speech", kind: "reference", required: true, accepts: [textTypes.text],
    summary: "The Text edge with the words that are spoken." },
  { name: "voice", kind: "reference", required: false, accepts: [textTypes.text],
    summary: "The Text edge describing the voice, in place of the element body." },
];

const children: readonly SurfaceChildVocabulary[] = [
  { tag: "voice", cardinality: "many",
    summary: "Attaches one audio Artifact the voice is carried from.",
    attributes: [
      { name: "audio", kind: "reference", required: true, accepts: [blobTypes.blob],
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
  outputs: [base.endpoints.design!.draftType, base.endpoints.design!.mediaBindings.voiceReference!.type],
  vocabulary: {
    summary,
    attributes,
    children,
    ports: [
      {
        name: "audio",
        type: blobTypes.blob,
        summary: "The spoken line, addressed as `<id>.audio`.",
      },
      {
        name: "reference",
        type: blobTypes.blob,
        summary: "The spoken line under its earlier spelling, `<id>.reference`.",
      },
    ],
    example,
    notes: [
      "The voice comes from the element body, a voice Text edge, or a voice recording child.",
      "The Surface lowers the element into the family's request; Pramaan picks the route.",
    ],
  },
});

export const voiceFamilyMarkupSurfaces = [
  surface("voice", "Voice",
    "Speaks one passage with a described, recorded or kept voice.",
    `<vo:Voice id="host-line" speech={line1}>
  a warm, upbeat young narrator
</vo:Voice>`),
  surface("voice-design", "VoiceDesign",
    "Speaks one passage with a described, recorded or kept voice (earlier spelling of Voice).",
    `<vo:VoiceDesign id="host-line" speech={line1}>
  a warm, upbeat young narrator
</vo:VoiceDesign>`),
  surface("voice-clone", "VoiceClone",
    "Speaks one passage with the voice a recording carries (earlier spelling of Voice).",
    `<vo:VoiceClone id="host-line" speech={line1}>
  <vo:voice audio={hostSample.audio}/>
</vo:VoiceClone>`),
] as const;

export const voiceFamilyManifest = {
  ...base.manifest,
};
export const voiceFamilyDefinition = {
  ...base,
  manifest: voiceFamilyManifest,
};
