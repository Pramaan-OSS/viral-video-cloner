import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createAdmissionPackageFacet } from "@hypit/hypit/admission";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import {
  speechFamilyComponent, speechFamilyDefinition, speechFamilyManifest, speechFamilyMarkupSurfaces,
  speechFamilyModuleRef,
} from "./index.js";
import {
  decodeSpeechFamilySoundEffectSurface, decodeSpeechFamilySpeakSurface,
  decodeSpeechFamilySoundtrackSurface,
} from "./surface.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: speechFamilyManifest }], facets: [
  createProducerPackageFacet(speechFamilyComponent),
  createAdmissionPackageFacet(speechFamilyComponent),
  speechFamilyDefinition.facet,
  createMarkupSurfaceFacet({ module: speechFamilyModuleRef,
    declaration: speechFamilyMarkupSurfaces.find((item) => item.name === "speak")!, handler: decodeSpeechFamilySpeakSurface }),
  createMarkupSurfaceFacet({ module: speechFamilyModuleRef,
    declaration: speechFamilyMarkupSurfaces.find((item) => item.name === "sound-effect")!, handler: decodeSpeechFamilySoundEffectSurface }),
  createMarkupSurfaceFacet({ module: speechFamilyModuleRef,
    declaration: speechFamilyMarkupSurfaces.find((item) => item.name === "soundtrack")!, handler: decodeSpeechFamilySoundtrackSurface }),
] };
export default hypitPackage;
