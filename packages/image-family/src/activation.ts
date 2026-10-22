import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createAdmissionPackageFacet } from "@hypit/hypit/admission";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import {
  imageFamilyComponent, imageFamilyDefinition, imageFamilyManifest, imageFamilyModuleRef,
  imageFamilyMarkupSurfaces,
} from "./index.js";
import { decodeImageFamilyImageSurface, decodeImageFamilyProImageSurface, decodeImageFamilyTextImageSurface } from "./surface.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: imageFamilyManifest }], facets: [
  createProducerPackageFacet(imageFamilyComponent),
  createAdmissionPackageFacet(imageFamilyComponent),
  imageFamilyDefinition.facet,
  createMarkupSurfaceFacet({ module: imageFamilyModuleRef,
    declaration: imageFamilyMarkupSurfaces.find((item) => item.name === "image")!, handler: decodeImageFamilyImageSurface }),
  createMarkupSurfaceFacet({ module: imageFamilyModuleRef,
    declaration: imageFamilyMarkupSurfaces.find((item) => item.name === "text-image")!, handler: decodeImageFamilyTextImageSurface }),
  createMarkupSurfaceFacet({ module: imageFamilyModuleRef,
    declaration: imageFamilyMarkupSurfaces.find((item) => item.name === "pro-image")!, handler: decodeImageFamilyProImageSurface }),
] };
export default hypitPackage;
