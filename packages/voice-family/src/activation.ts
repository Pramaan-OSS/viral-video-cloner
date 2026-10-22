import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createAdmissionPackageFacet } from "@hypit/hypit/admission";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import {
  voiceFamilyComponent, voiceFamilyDefinition, voiceFamilyManifest, voiceFamilyMarkupSurfaces,
  voiceFamilyModuleRef,
} from "./index.js";
import { decodeVoiceFamilyVoiceCloneSurface, decodeVoiceFamilyVoiceDesignSurface, decodeVoiceFamilyVoiceSurface } from "./surface.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: voiceFamilyManifest }], facets: [
  createProducerPackageFacet(voiceFamilyComponent),
  createAdmissionPackageFacet(voiceFamilyComponent),
  voiceFamilyDefinition.facet,
  createMarkupSurfaceFacet({ module: voiceFamilyModuleRef,
    declaration: voiceFamilyMarkupSurfaces.find((item) => item.name === "voice")!, handler: decodeVoiceFamilyVoiceSurface }),
  createMarkupSurfaceFacet({ module: voiceFamilyModuleRef,
    declaration: voiceFamilyMarkupSurfaces.find((item) => item.name === "voice-design")!, handler: decodeVoiceFamilyVoiceDesignSurface }),
  createMarkupSurfaceFacet({ module: voiceFamilyModuleRef,
    declaration: voiceFamilyMarkupSurfaces.find((item) => item.name === "voice-clone")!, handler: decodeVoiceFamilyVoiceCloneSurface }),
] };
export default hypitPackage;
