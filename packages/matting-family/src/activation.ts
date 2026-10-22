import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createAdmissionPackageFacet } from "@hypit/hypit/admission";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import {
  mattingFamilyComponent, mattingFamilyDefinition, mattingFamilyManifest, mattingFamilyMarkupSurfaces,
  mattingFamilyModuleRef,
} from "./index.js";
import { decodeMattingFamilyMatteSurface } from "./surface.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: mattingFamilyManifest }], facets: [
  createProducerPackageFacet(mattingFamilyComponent),
  createAdmissionPackageFacet(mattingFamilyComponent),
  mattingFamilyDefinition.facet,
  createMarkupSurfaceFacet({ module: mattingFamilyModuleRef,
    declaration: mattingFamilyMarkupSurfaces.find((item) => item.name === "matte")!, handler: decodeMattingFamilyMatteSurface }),
  createMarkupSurfaceFacet({ module: mattingFamilyModuleRef,
    declaration: mattingFamilyMarkupSurfaces.find((item) => item.name === "portrait")!, handler: decodeMattingFamilyMatteSurface }),
] };
export default hypitPackage;
