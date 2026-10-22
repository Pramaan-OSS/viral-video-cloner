import { blobTypes } from "@hypit/hypit/blob";
import { generationPort, sealGenerationMediaBinding, sealGenerationRequestDraft } from "@hypit/generation";
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

import { videoFamilyEndpoints } from "./index.js";

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

function text(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  assert(typeof value === "string" && value.trim().length > 0, `${element.name}.${name} must be text`);
  return value.trim();
}

function optionalText(element: StructuredElement, name: string): string | undefined {
  const value = element.attributes[name];
  if (value === undefined) return undefined;
  assert(typeof value === "string" && value.trim().length > 0, `${element.name}.${name} must be text`);
  return value.trim();
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

function optionalRef(
  element: StructuredElement,
  name: string,
  type: TypeRef,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference | undefined {
  return element.attributes[name] === undefined ? undefined : ref(element, name, type, resolve);
}

function verifyBlob(record: SurfaceResolvedReference["record"], subject: string, mediaType: string): void {
  if (record !== undefined) {
    assert(record.value.kind === "blob" && record.value.mediaType.startsWith(mediaType),
      `${subject} must reference ${mediaType} media`);
  }
}

type MediaAddition = { readonly port: string; readonly source: SurfaceResolvedReference };

function decoder(endpoint: ExactModelEndpoint, requiredAttributes: readonly string[]): StructuredSurfaceHandler {
  return ({ element, resolveReference }) => {
    exact(element,
      ["id", "prompt", "aspect-ratio", "resolution", "duration", "generate-audio", "first-frame", "last-frame"],
      requiredAttributes);
    const id = text(element, "id");
    const prompt = ref(element, "prompt", textTypes.text, resolveReference);
    if (prompt.record !== undefined) {
      assert(prompt.record.value.kind === "inline", `${element.name}.prompt must reference Text`);
      verifyText(prompt.record.value.value);
    }
    const firstFrame = optionalRef(element, "first-frame", blobTypes.blob, resolveReference);
    const lastFrame = optionalRef(element, "last-frame", blobTypes.blob, resolveReference);
    assert(lastFrame === undefined || firstFrame !== undefined, `${element.name}.last-frame needs first-frame`);
    if (firstFrame !== undefined) verifyBlob(firstFrame.record, `${element.name}.first-frame`, "image/");
    if (lastFrame !== undefined) verifyBlob(lastFrame.record, `${element.name}.last-frame`, "image/");

    const references: { readonly image: SurfaceResolvedReference[]; readonly video: SurfaceResolvedReference[]; readonly audio: SurfaceResolvedReference[] } = {
      image: [], video: [], audio: [],
    };
    for (const child of element.children) {
      if (child.kind === "text") {
        assert(child.value.trim().length === 0, `${element.name} accepts only Reference children`);
        continue;
      }
      assert(["Reference", "ReferenceVideo", "ReferenceImage"].includes(localName(child.name)),
        `${element.name} accepts only Reference children`);
      exact(child, ["image", "video", "audio"], []);
      assert(!child.children.some((item) => item.kind === "element" || item.value.trim()), `${child.name} must be empty`);
      const kinds = (["image", "video", "audio"] as const).filter((kind) => child.attributes[kind] !== undefined);
      assert(kinds.length === 1, `${child.name} must select exactly one of image, video or audio`);
      const kind = kinds[0]!;
      const source = ref(child, kind, blobTypes.blob, resolveReference);
      verifyBlob(source.record, `${child.name}.${kind}`, `${kind}/`);
      references[kind].push(source);
    }

    const imagePort = generationPort(endpoint.ports, "referenceImages");
    const videoPort = generationPort(endpoint.ports, "referenceVideos");
    const audioPort = generationPort(endpoint.ports, "referenceAudio");
    assert(references.image.length <= imagePort.maxItems, `${element.name} accepts at most ${imagePort.maxItems} image references`);
    assert(references.video.length <= videoPort.maxItems, `${element.name} accepts at most ${videoPort.maxItems} video references`);
    assert(references.audio.length <= audioPort.maxItems, `${element.name} accepts at most ${audioPort.maxItems} audio references`);

    const duration = optionalText(element, "duration");
    const generateAudio = optionalText(element, "generate-audio");
    if (generateAudio !== undefined) assert(["true", "false"].includes(generateAudio), `${element.name}.generate-audio must be true or false`);
    const draft = sealGenerationRequestDraft(endpoint.ports, {
      aspectRatio: [text(element, "aspect-ratio")],
      resolution: [text(element, "resolution")],
      ...(duration === undefined ? {} : { duration: [Number(duration)] }),
      ...(generateAudio === undefined ? {} : { generateAudio: [generateAudio === "true"] }),
    });

    const records: Array<{ id: string; type: TypeRef; value: { kind: "inline"; value: CanonicalValue }; range: StructuredElement["range"] }> = [{
      id: `${id}.draft`, type: endpoint.draftType,
      value: { kind: "inline", value: draft as unknown as CanonicalValue }, range: element.range,
    }];
    const inputs: Record<string, SurfaceResolvedReference["ref"] | { kind: "record"; id: string }> = {
      draft: { kind: "record", id: `${id}.draft` }, [exactModelTextInputName("prompt")]: prompt.ref,
    };
    const additions: readonly MediaAddition[] = [
      ...(firstFrame === undefined ? [] : [{ port: "firstFrame", source: firstFrame }]),
      ...(lastFrame === undefined ? [] : [{ port: "lastFrame", source: lastFrame }]),
      ...references.image.map((source) => ({ port: "referenceImages", source })),
      ...references.video.map((source) => ({ port: "referenceVideos", source })),
      ...references.audio.map((source) => ({ port: "referenceAudio", source })),
    ];
    const media = additions.map((addition, index) => {
      const name = `${addition.port}-${String(index + 1).padStart(4, "0")}`;
      const bindingId = `${id}.${name}.binding`;
      records.push({
        id: bindingId, type: endpoint.mediaBindings[addition.port]!.type,
        value: {
          kind: "inline",
          value: sealGenerationMediaBinding(generationPort(endpoint.ports, addition.port) as GenerationMediaPort,
            { role: addition.port === "referenceAudio" ? "audio" : addition.port === "referenceVideos" ? "video" : "image" }) as unknown as CanonicalValue,
        },
        range: element.range,
      });
      const names = exactModelMediaInputNames(name);
      inputs[names.binding] = { kind: "record", id: bindingId };
      inputs[names.artifact] = addition.source.ref;
      return { name, port: addition.port } as const;
    });
    const fragment = createExactModelPrimaryGenerationFragment(endpoint, media, [{ name: "prompt", port: "prompt" }]);
    return { records, fragments: [fragment], components: [{
      id, fragment: fragment.id, inputs, outputs: { video: `${id}.video` }, range: element.range,
    }] };
  };
}

const required: readonly string[] = ["id", "prompt", "aspect-ratio", "resolution"];
export const decodeVideoFamilyVideoSurface = decoder(videoFamilyEndpoints.video!, required);
export const decodeVideoFamilyTextVideoSurface = decoder(videoFamilyEndpoints.video!, required);
export const decodeVideoFamilyFrameVideoSurface = decoder(videoFamilyEndpoints.video!, [...required, "first-frame"]);
export const decodeVideoFamilyReferenceVideoSurface = decoder(videoFamilyEndpoints.video!, required);
