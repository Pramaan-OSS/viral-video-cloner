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
import type { MarkupAttributeValue, StructuredElement, StructuredSurfaceHandler, SurfaceDecodeOutput, SurfaceResolvedReference } from "@hypit/hypit/markup";
import { textTypes, verifyText } from "@hypit/hypit/text";

import { voiceFamilyEndpoints } from "./index.js";

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

/** The voice description in the element body, the way earlier files wrote it. */
function bodyText(element: StructuredElement): string | undefined {
  assert(!element.children.some((child) => child.kind === "element" && localName(child.name) !== "voice"),
    `${element.name} accepts voice children and description text only`);
  const lines = element.children.map((child) => child.kind === "text" ? child.value : "").join("")
    .replaceAll("\r\n", "\n").split("\n");
  while (lines[0]?.trim() === "") lines.shift();
  while (lines.at(-1)?.trim() === "") lines.pop();
  const indents = lines.filter((line) => line.trim()).map((line) => /^\s*/u.exec(line)?.[0].length ?? 0);
  const indent = indents.length === 0 ? 0 : Math.min(...indents);
  const value = lines.map((line) => line.slice(indent).trimEnd()).join("\n").trim();
  return value.length === 0 ? undefined : value;
}

function voiceDecoder(outputSpelling: "audio" | "reference"): StructuredSurfaceHandler {
  return ({ element, resolveReference }) => decodeVoice(element, resolveReference, outputSpelling);
}

function decodeVoice(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
  outputSpelling: "audio" | "reference",
): SurfaceDecodeOutput {
  {
  const endpoint = voiceFamilyEndpoints.design!;
  exact(element, ["id", "speech", "voice"], ["id", "speech"]);
  const id = String(element.attributes.id);
  assert(typeof id === "string" && id.trim().length > 0, `${element.name}.id must be text`);
  const speech = verifiedText(element, "speech", resolveReference);
  const voiceEdge = element.attributes.voice === undefined
    ? undefined : verifiedText(element, "voice", resolveReference);
  const description = bodyText(element);
  const voiceReference: SurfaceResolvedReference[] = [];
  for (const child of element.children) {
    if (child.kind !== "element") continue;
    assert(localName(child.name) === "voice", `${element.name} accepts only voice children`);
    exact(child, ["audio"], ["audio"]);
    const audio = ref(child, "audio", blobTypes.blob, resolveReference);
    if (audio.record !== undefined) {
      assert(audio.record.value.kind === "blob" && audio.record.value.mediaType.startsWith("audio/"),
        `${child.name}.audio must reference audio media`);
    }
    voiceReference.push(audio);
  }
  assert(voiceReference.length <= 1, `${element.name} accepts at most one voice child`);
  assert(voiceEdge === undefined || description === undefined,
    `${element.name} takes its voice description from its body or a voice Text edge, not both`);
  assert(voiceEdge !== undefined || description !== undefined || voiceReference.length === 1,
    `${element.name} needs a voice: a body description, a voice Text edge, or one voice recording child`);

  const draft = sealGenerationRequestDraft(endpoint.ports,
    description !== undefined ? { voiceDescription: [description] } : {});
  const records: Array<{ id: string; type: TypeRef; value: { kind: "inline"; value: CanonicalValue }; range: StructuredElement["range"] }> = [{
    id: `${id}.draft`, type: endpoint.draftType,
    value: { kind: "inline", value: draft as unknown as CanonicalValue }, range: element.range,
  }];
  const inputs: Record<string, SurfaceResolvedReference["ref"] | { kind: "record"; id: string }> = {
    draft: { kind: "record", id: `${id}.draft` },
    [exactModelTextInputName("text")]: speech.ref,
  };
  if (voiceEdge !== undefined) inputs[exactModelTextInputName("voiceDescription")] = voiceEdge.ref;

  const media = voiceReference.map((source, index) => {
    const name = `voiceReference-${String(index + 1).padStart(4, "0")}`;
    const bindingId = `${id}.${name}.binding`;
    records.push({
      id: bindingId, type: endpoint.mediaBindings.voiceReference!.type,
      value: {
        kind: "inline",
        value: sealGenerationMediaBinding(generationPort(endpoint.ports, "voiceReference") as GenerationMediaPort,
          { role: "audio" }) as unknown as CanonicalValue,
      },
      range: element.range,
    });
    const names = exactModelMediaInputNames(name);
    inputs[names.binding] = { kind: "record", id: bindingId };
    inputs[names.artifact] = source.ref;
    return { name, port: "voiceReference" } as const;
  });

  const fragment = createExactModelPrimaryGenerationFragment(endpoint, media,
    [{ name: "text", port: "text" }, ...(voiceEdge !== undefined ? [{ name: "voiceDescription", port: "voiceDescription" }] : [])]);
  return { records, fragments: [fragment], components: [{
    // The output path spelling follows the tag: family files use `.audio`, earlier files `.reference`.
    id, fragment: fragment.id, inputs, outputs: { audio: `${id}.${outputSpelling}` }, range: element.range,
  }] };
  }
}

export const decodeVoiceFamilyVoiceSurface = voiceDecoder("audio");
export const decodeVoiceFamilyVoiceDesignSurface = voiceDecoder("reference");
export const decodeVoiceFamilyVoiceCloneSurface = voiceDecoder("reference");
