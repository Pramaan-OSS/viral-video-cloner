import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createAdmissionPackageFacet } from "@hypit/hypit/admission";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import {
  videoFamilyComponent, videoFamilyDefinition, videoFamilyManifest, videoFamilyModuleRef,
  videoFamilyMarkupSurfaces,
} from "./index.js";
import {
  decodeVideoFamilyFrameVideoSurface, decodeVideoFamilyReferenceVideoSurface,
  decodeVideoFamilyTextVideoSurface, decodeVideoFamilyVideoSurface,
} from "./surface.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: videoFamilyManifest }], facets: [
  createProducerPackageFacet(videoFamilyComponent),
  createAdmissionPackageFacet(videoFamilyComponent),
  videoFamilyDefinition.facet,
  createMarkupSurfaceFacet({ module: videoFamilyModuleRef,
    declaration: videoFamilyMarkupSurfaces.find((item) => item.name === "video")!, handler: decodeVideoFamilyVideoSurface }),
  createMarkupSurfaceFacet({ module: videoFamilyModuleRef,
    declaration: videoFamilyMarkupSurfaces.find((item) => item.name === "text-video")!, handler: decodeVideoFamilyTextVideoSurface }),
  createMarkupSurfaceFacet({ module: videoFamilyModuleRef,
    declaration: videoFamilyMarkupSurfaces.find((item) => item.name === "frame-video")!, handler: decodeVideoFamilyFrameVideoSurface }),
  createMarkupSurfaceFacet({ module: videoFamilyModuleRef,
    declaration: videoFamilyMarkupSurfaces.find((item) => item.name === "reference-video")!, handler: decodeVideoFamilyReferenceVideoSurface }),
] };
export default hypitPackage;
