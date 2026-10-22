import { blobTypes } from "@hypit/hypit/blob";
import { sealGenerationPortRequest, sealGenerationRequestDraft, sealGenerationPortTable } from "@hypit/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@hypit/generation";
import type { SurfaceAttributeVocabulary, SurfaceChildVocabulary } from "@hypit/hypit/markup";
import { defineExactModelModule } from "@hypit/generation/model";
import { textTypes } from "@hypit/hypit/text";

export const imageFamilyModuleRef = { name: "@hypit/image-family", version: "1" } as const;

/** The image family's one capability: one generation request, Pramaan routes it. */
export const imageFamilyCapability = "generate";

const RATIOS = ["auto", "1:1", "2:3", "3:2", "1:4", "4:1", "3:4", "4:3", "4:5",
  "5:4", "1:8", "8:1", "9:16", "16:9", "21:9"] as const;

function table(): GenerationPortTable {
  return sealGenerationPortTable({
    model: imageFamilyCapability,
    result: "image",
    ports: [
      { name: "prompt", value: { kind: "text", maxChars: 20_000 }, minItems: 1, maxItems: 1 },
      { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 10 },
      {
        name: "aspectRatio",
        value: { kind: "enum", values: [...RATIOS] },
        minItems: 1,
        maxItems: 1,
      },
      { name: "resolution", value: { kind: "enum", values: ["1K", "2K", "4K"] }, minItems: 1, maxItems: 1 },
      { name: "outputFormat", value: { kind: "enum", values: ["png", "jpg"] }, minItems: 0, maxItems: 1 },
    ],
    requires: [],
  });
}

export const imageFamilyPorts: GenerationPortTable = table();

export function sealImageFamilyRequest(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(imageFamilyPorts, ports);
}

export function sealImageFamilyRequestDraft(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
) {
  return sealGenerationRequestDraft(imageFamilyPorts, ports);
}

const base = defineExactModelModule({
  module: imageFamilyModuleRef,
  endpoints: ([
    ["image", imageFamilyCapability, "ImageFamilyGenerateRequest"],
  ] as const).map(([key, model, requestTypeName]) => ({
    key,
    requestTypeName,
    producerName: `request-${model}`,
    ports: imageFamilyPorts,
  })),
});

export const imageFamilyEndpoints = base.endpoints;
export const imageFamilyComponent = base.component;

const attributes: readonly SurfaceAttributeVocabulary[] = [
  {
    name: "id",
    kind: "identifier",
    required: true,
    summary: "Names this generation and prefixes the bindings it publishes.",
  },
  {
    name: "prompt",
    kind: "reference",
    required: true,
    summary: "The Text edge describing the picture.",
    accepts: [textTypes.text],
  },
  {
    name: "aspect-ratio",
    kind: "literal",
    required: true,
    summary: "The shape of the generated picture.",
    values: [...RATIOS],
  },
  {
    name: "resolution",
    kind: "literal",
    required: true,
    summary: "The size band the picture renders at.",
    values: ["1K", "2K", "4K"],
  },
  {
    name: "output-format",
    kind: "literal",
    required: false,
    summary: "The encoding of the returned image Artifact; png when omitted.",
    values: ["png", "jpg"],
  },
];

const children: readonly SurfaceChildVocabulary[] = [
  { tag: "Reference", cardinality: "many",
    summary: "Attaches one image Artifact as a reference picture.",
    attributes: [
      { name: "image", kind: "reference", required: true, accepts: [blobTypes.blob],
        summary: "Selects the image Artifact this reference contributes." },
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
  outputs: [base.endpoints.image!.draftType, base.endpoints.image!.mediaBindings.images!.type],
  vocabulary: {
    summary,
    attributes,
    children,
    ports: [{
      name: "image",
      type: blobTypes.blob,
      summary: "The generated image, addressed as `<id>.image`.",
    }],
    example,
    notes: [
      "The element accepts at most 10 `Reference` children and no text content.",
      "Every `Reference` is an ordinary image Artifact edge; the Surface copies no runtime media into request metadata.",
      "The Surface lowers the element into the family's generation request; Pramaan picks the route.",
    ],
  },
});

export const imageFamilyMarkupSurfaces = [
  surface("image", "Image",
    "Generates one picture from a Text prompt and optional reference images.",
    `<img:Image
  id="draft"
  prompt={prompt}
  aspect-ratio="9:16"
  resolution="2K"
  output-format="png"
>
  <img:Reference image={person.image}/>
</img:Image>`),
  surface("text-image", "TextImage",
    "Generates one picture from a Text prompt and optional reference images (earlier spelling of Image).",
    `<img:TextImage id="draft" prompt={prompt} aspect-ratio="9:16" resolution="2K" output-format="png"/>`),
  surface("pro-image", "ProImage",
    "Generates one picture from a Text prompt and optional reference images (earlier spelling of Image).",
    `<img:ProImage id="final" prompt={finalPrompt} aspect-ratio="9:16" resolution="4K" output-format="png"/>`),
] as const;

export const imageFamilyManifest = {
  ...base.manifest,
};
export const imageFamilyDefinition = {
  ...base,
  manifest: imageFamilyManifest,
};
