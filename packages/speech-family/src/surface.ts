import { blobTypes } from "@hypit/hypit/blob";
import { generationPort, sealGenerationMediaBinding, sealGenerationRequestDraft } from "@hypit/generation";
import type { GenerationPortValue } from "@hypit/generation";
import type { GenerationMediaPort } from "@hypit/generation";
import {
  createExactModelPrimaryGenerationFragment,
  exactModelMediaInputNames,
  exactModelTextInputName,
} from "@hypit/generation/model";
import type { ExactModelEndpoint } from "@hypit/generation/model";
import type { CanonicalValue, TypeRef } from "@hypit/hypit/protocol";
import type { MarkupAttributeValue, StructuredElement, StructuredSurfaceHandler, SurfaceResolvedReference } from "@hypit/hypit/markup";
import { textTypes, verifyText } from "@hypit/hypit/text";

import { speechFamilyEndpoints } from "./index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function localName(name: string): string {
  return name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
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

function ref(
  element: StructuredElement,
  name: string,
  type: TypeRef,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const value: MarkupAttributeValue | undefined = element.attributes[name];
  assert(typeof value === "object" && value.kind === "reference", `${element.name}.${name} must be a reference`);
  const result = resolve(value.path);
  assert(result !== undefined && sameType(result.type, type), `${element.name}.${name} has the wrong type`);
  return result;
}

function verifiedText(
  element: StructuredElement,
  name: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const reference = ref(element, name, textTypes.text, resolve);
  if (reference.record !== undefined) {
    assert(reference.record.value.kind === "inline", `${element.name}.${name} must reference Text`);
    verifyText(reference.record.value.value);
  }
  return reference;
}

type EndpointKey = keyof typeof speechFamilyEndpoints;

function decode(
  endpointKey: EndpointKey,
  textInputs: readonly { readonly attribute: string; readonly port: string }[],
  requiredAttributes: readonly string[],
  videoPort: string | undefined,
): StructuredSurfaceHandler {
  const endpoint = speechFamilyEndpoints[endpointKey]!;
  return ({ element, resolveReference }) => {
    const allowed = ["id", ...textInputs.map((item) => item.attribute)];
    exact(element, allowed, ["id", ...requiredAttributes]);
    const id = String(element.attributes.id);
    assert(typeof id === "string" && id.trim().length > 0, `${element.name}.id must be text`);
    const texts = textInputs.map((item) => ({
      input: { name: item.port } as const,
      source: verifiedText(element, item.attribute, resolveReference),
    }));

    const videos: SurfaceResolvedReference[] = [];
    if (videoPort !== undefined) {
      for (const child of element.children) {
        if (child.kind === "text") {
          assert(child.value.trim().length === 0, `${element.name} accepts only Reference children`);
          continue;
        }
        assert(localName(child.name) === "Reference", `${element.name} accepts only Reference children`);
        exact(child, ["video"], ["video"]);
        assert(!child.children.some((item) => item.kind === "element" || item.value.trim()), `${child.name} must be empty`);
        videos.push(ref(child, "video", blobTypes.blob, resolveReference));
      }
      const port = generationPort(endpoint.ports, videoPort);
      assert(port.value.kind === "media", `The ${endpointKey} video port is not media`);
      assert(videos.length <= port.maxItems, `${element.name} accepts at most ${port.maxItems} video references`);
    } else {
      assert(element.children.every((child) => child.kind === "text" && child.value.trim().length === 0),
        `${element.name} accepts no children`);
    }

    const draft = sealGenerationRequestDraft(endpoint.ports, {} as Record<string, readonly GenerationPortValue[]>);
    const records: Array<{ id: string; type: TypeRef; value: { kind: "inline"; value: CanonicalValue }; range: StructuredElement["range"] }> = [{
      id: `${id}.draft`, type: endpoint.draftType,
      value: { kind: "inline", value: draft as unknown as CanonicalValue }, range: element.range,
    }];
    const inputs: Record<string, SurfaceResolvedReference["ref"] | { kind: "record"; id: string }> = {
      draft: { kind: "record", id: `${id}.draft` },
    };
    for (const item of texts) inputs[exactModelTextInputName(item.input.name)] = item.source.ref;

    const media = (videoPort === undefined ? [] : videos.map((source, index) => {
      const name = `${videoPort}-${String(index + 1).padStart(4, "0")}`;
      const bindingId = `${id}.${name}.binding`;
      records.push({
        id: bindingId, type: endpoint.mediaBindings[videoPort]!.type,
        value: {
          kind: "inline",
          value: sealGenerationMediaBinding(generationPort(endpoint.ports, videoPort) as GenerationMediaPort,
            { role: "video" }) as unknown as CanonicalValue,
        },
        range: element.range,
      });
      const names = exactModelMediaInputNames(name);
      inputs[names.binding] = { kind: "record", id: bindingId };
      inputs[names.artifact] = source.ref;
      return { name, port: videoPort } as const;
    }));

    const fragment = createExactModelPrimaryGenerationFragment(endpoint, media,
      texts.map((item) => ({ name: item.input.name, port: item.input.name })));
    return { records, fragments: [fragment], components: [{
      id, fragment: fragment.id, inputs, outputs: { audio: `${id}.audio` }, range: element.range,
    }] };
  };
}

export const decodeSpeechFamilySpeakSurface =
  decode("speak", [{ attribute: "speech", port: "text" }, { attribute: "voice", port: "voice" }], ["speech"], undefined);
export const decodeSpeechFamilySoundEffectSurface =
  decode("sound-effect", [{ attribute: "prompt", port: "prompt" }], ["prompt"], undefined);
export const decodeSpeechFamilySoundtrackSurface =
  decode("soundtrack", [{ attribute: "prompt", port: "prompt" }], ["prompt"], "video");
