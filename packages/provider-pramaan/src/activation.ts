import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  verifyCredentialRef,
} from "@hypit/runtime-local/extension";
import { credentialRef } from "@hypit/hypit/endpoint";

import { createPramaanProvider, pramaanProviderModuleRef } from "./index.js";

export const pramaanRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@hypit/provider-pramaan",
  activate(context) {
    const config = runtimeConfigObject(context.config, "Pramaan");
    const pollIntervalMs = runtimeConfigPositiveInteger(config.pollIntervalMs, "Pramaan pollIntervalMs");
    let apiKey: ReturnType<typeof credentialRef> | undefined;
    const apiKeyValue = config.apiKey;
    if (apiKeyValue !== undefined) {
      if (apiKeyValue === null || typeof apiKeyValue !== "object" || Array.isArray(apiKeyValue)) {
        throw new Error("Pramaan apiKey must be a CredentialRef");
      }
      verifyCredentialRef(apiKeyValue as never);
      apiKey = apiKeyValue as ReturnType<typeof credentialRef>;
    }
    return {
      endpoint: createPramaanProvider({
        instance: context.instance,
        ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
        ...(apiKey === undefined ? {} : { apiKey }),
      }),
    };
  },
});

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [],
  facets: [pramaanRuntimeAdapter],
};
export default hypitPackage;

void pramaanProviderModuleRef;
