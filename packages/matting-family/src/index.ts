import { blobTypes } from "@hypit/hypit/blob";
import { sealGenerationPortRequest, sealGenerationRequestDraft, sealGenerationPortTable } from "@hypit/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@hypit/generation";
import type { SurfaceAttributeVocabulary, SurfaceChildVocabulary } from "@hypit/hypit/markup";
import { defineExactModelModule } from "@hypit/generation/model";

export const mattingFamilyModuleRef = { name: "@hypit/matting-family", version: "1" } as const;

/** The matting family's one capability: lift the person off the background, keeping transparency. */
export const mattingFamilyCapability = "matte";

function table(): GenerationPortTable {
  return sealGenerationPortTable({
    model: mattingFamilyCapability,
    result: "video",
    ports: [
      { name: "source", value: { kind: "media", accepts: ["video"] }, minItems: 1, maxItems: 1 },
      { name: "format", value: { kind: "enum", values: ["WEBM", "MOV"] }, minItems: 0, maxItems: 1 },
    ],
    requires: [],
  });
}

export const mattingFamilyPorts: GenerationPortTable = table();

export function sealMattingFamilyRequest(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(mattingFamilyPorts, ports);
}

export function sealMattingFamilyRequestDraft(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
) {
  return sealGenerationRequestDraft(mattingFamilyPorts, ports);
}

const base = defineExactModelModule({
  module: mattingFamilyModuleRef,
  endpoints: ([
    ["portrait", mattingFamilyCapability, "MattingFamilyMatteRequest"],
  ] as const).map(([key, model, requestTypeName]) => ({
    key,
    requestTypeName,
    producerName: `request-${model}`,
    ports: mattingFamilyPorts,
  })),
});

export const mattingFamilyEndpoints = base.endpoints;
export const mattingFamilyComponent = base.component;

const attributes: readonly SurfaceAttributeVocabulary[] = [
  { name: "id", kind: "identifier", required: true, summary: "Names the processed video." },
  { name: "source", kind: "reference", required: true, accepts: [blobTypes.blob],
    summary: "Selects the video Artifact the person is lifted from." },
  { name: "format", kind: "literal", required: false, values: ["WEBM", "MOV"],
    summary: "The container of the returned video; transparency is kept either way." },
];

const noChildren: readonly SurfaceChildVocabulary[] = [];

const surface = (
  name: string,
  tag: string,
  summary: string,
  example: string,
) => ({
  name,
  tag,
  mode: "structured" as const,
  outputs: [base.endpoints.portrait!.draftType, base.endpoints.portrait!.mediaBindings.source!.type],
  vocabulary: {
    summary,
    attributes,
    children: noChildren,
    ports: [{ name: "video", type: blobTypes.blob, summary: "The processed video Artifact, before normalization." }],
    example,
    notes: [
      "The Surface lowers the element into the family's request; Pramaan picks the route.",
    ],
  },
});

export const mattingFamilyMarkupSurfaces = [
  surface("matte", "Matte",
    "Lifts the person in one video off the background, keeping transparency.",
    `<mat:Matte id="host-cut" source={hostTake.video} format="WEBM"/>`),
  surface("portrait", "Portrait",
    "Lifts the person in one video off the background, keeping transparency (earlier spelling of Matte).",
    `<mat:Portrait id="host-cut" source={hostTake.video} format="WEBM"/>`),
] as const;

export const mattingFamilyManifest = {
  ...base.manifest,
};
export const mattingFamilyDefinition = {
  ...base,
  manifest: mattingFamilyManifest,
};
