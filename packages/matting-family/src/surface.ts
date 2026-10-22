import { blobTypes } from "@hypit/hypit/blob";
import { generationPort, sealGenerationMediaBinding, sealGenerationRequestDraft } from "@hypit/generation";
import type { GenerationMediaPort } from "@hypit/generation";
import {
  createExactModelPrimaryGenerationFragment,
  exactModelMediaInputNames,
} from "@hypit/generation/model";
import type { ExactModelEndpoint } from "@hypit/generation/model";
import type { CanonicalValue, TypeRef } from "@hypit/hypit/protocol";
import type { MarkupAttributeValue, StructuredElement, StructuredSurfaceHandler, SurfaceResolvedReference } from "@hypit/hypit/markup";

import { mattingFamilyEndpoints } from "./index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sameType(left: TypeRef, right: TypeRef): boolean {
  return left.name === right.name && left.module.name === right.module.name && left.module.version === right.module.version;
}

function exact(element: StructuredElement, allowed: readonly string[], required: readonly string[], tolerant = true): void {
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.includes(name));
  // Legacy tag names from earlier files load with their extra attributes ignored; the family
  // tag itself stays strict, so new authoring cannot drift.
  if (!tolerant) {
    assert(unknown.length === 0, `${element.name} does not accept ${unknown[0]}; update the element to its family form`);
  }
  const missing = required.filter((name) => element.attributes[name] === undefined);
  assert(missing.length === 0, `${element.name} requires ${missing.join(", ")}`);
}

function sourceRef(
  element: StructuredElement,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const value: MarkupAttributeValue | undefined = element.attributes.source;
  assert(typeof value === "object" && value.kind === "reference", `${element.name}.source must be a reference`);
  const result = resolve(value.path);
  assert(result !== undefined && sameType(result.type, blobTypes.blob), `${element.name}.source has the wrong type`);
  if (result.record !== undefined) {
    assert(result.record.value.kind === "blob" && result.record.value.mediaType.startsWith("video/"),
      `${element.name}.source must reference video media`);
  }
  return result;
}

function decoder(endpoint: ExactModelEndpoint): StructuredSurfaceHandler {
  return ({ element, resolveReference }) => {
    exact(element, ["id", "source", "format"], ["id", "source"]);
    const id = String(element.attributes.id);
    assert(typeof id === "string" && id.trim().length > 0, `${element.name}.id must be text`);
    const source = sourceRef(element, resolveReference);
    const format = element.attributes.format;
    if (format !== undefined) assert(format === "WEBM" || format === "MOV", `${element.name}.format must be WEBM or MOV`);
    const draft = sealGenerationRequestDraft(endpoint.ports,
      format === undefined ? {} : { format: [format] });
    const records: Array<{ id: string; type: TypeRef; value: { kind: "inline"; value: CanonicalValue }; range: StructuredElement["range"] }> = [{
      id: `${id}.draft`, type: endpoint.draftType,
      value: { kind: "inline", value: draft as unknown as CanonicalValue }, range: element.range,
    }];
    const name = "source";
    const bindingId = `${id}.${name}.binding`;
    records.push({
      id: bindingId, type: endpoint.mediaBindings.source!.type,
      value: {
        kind: "inline",
        value: sealGenerationMediaBinding(generationPort(endpoint.ports, "source") as GenerationMediaPort,
          { role: "video" }) as unknown as CanonicalValue,
      },
      range: element.range,
    });
    const names = exactModelMediaInputNames(name);
    const inputs: Record<string, SurfaceResolvedReference["ref"] | { kind: "record"; id: string }> = {
      draft: { kind: "record", id: `${id}.draft` },
      [names.binding]: { kind: "record", id: bindingId },
      [names.artifact]: source.ref,
    };
    const fragment = createExactModelPrimaryGenerationFragment(endpoint, [{ name, port: "source" }], []);
    return { records, fragments: [fragment], components: [{
      id, fragment: fragment.id, inputs, outputs: { video: `${id}.video` }, range: element.range,
    }] };
  };
}

export const decodeMattingFamilyMatteSurface = decoder(mattingFamilyEndpoints.portrait!);
