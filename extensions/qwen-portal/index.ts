import {
  definePluginEntry,
  type ProviderAuthContext,
  type ProviderCatalogContext,
} from "openclaw/plugin-sdk/plugin-entry";
import {
  ensureAuthProfileStore,
  listProfilesForProvider,
  resolveOAuthApiKeyMarker,
  type OAuthCredential,
} from "openclaw/plugin-sdk/provider-auth";
import type { ProviderPlugin } from "openclaw/plugin-sdk/provider-model-shared";
import { buildQwenPortalProvider } from "./provider-catalog.js";
import {
  refreshQwenPortalOAuthCredential,
  runQwenPortalDeviceOAuth,
} from "./qwen-portal-oauth-device.js";

const PROVIDER_ID = "qwen-portal";

function buildQwenPortalProviderPlugin(): ProviderPlugin {
  return {
    id: PROVIDER_ID,
    label: "Qwen Portal",
    docsPath: "/providers/qwen",
    auth: [
      {
        id: "oauth",
        label: "Qwen Portal OAuth",
        hint: "Sign in via chat.qwen.ai (device code)",
        kind: "oauth",
        run: async (ctx: ProviderAuthContext) => runQwenPortalDeviceOAuth(ctx),
      },
    ],
    wizard: {
      setup: {
        choiceId: "qwen-portal-oauth",
        choiceLabel: "Qwen Portal (chat.qwen.ai OAuth)",
        choiceHint: "Device sign-in → portal.qwen.ai",
        methodId: "oauth",
      },
    },
    catalog: {
      order: "profile",
      run: async (ctx: ProviderCatalogContext) => {
        const authStore = ensureAuthProfileStore(ctx.agentDir, {
          allowKeychainPrompt: false,
        });
        if (listProfilesForProvider(authStore, PROVIDER_ID).length === 0) {
          return null;
        }
        const built = buildQwenPortalProvider();
        const explicit = ctx.config.models?.providers?.[PROVIDER_ID];
        const baseUrl =
          typeof explicit?.baseUrl === "string" && explicit.baseUrl.trim()
            ? explicit.baseUrl.trim()
            : built.baseUrl;
        const auth = ctx.resolveProviderAuth(PROVIDER_ID);
        const apiKey =
          auth.mode === "oauth"
            ? resolveOAuthApiKeyMarker(PROVIDER_ID)
            : auth.apiKey?.trim() || undefined;
        if (!apiKey) {
          return null;
        }
        return {
          provider: {
            ...built,
            baseUrl,
            apiKey,
          },
        };
      },
    },
    refreshOAuth: async (cred: OAuthCredential) => refreshQwenPortalOAuthCredential(cred),
    capabilities: {
      providerFamily: "openai",
    },
  };
}

export default definePluginEntry({
  id: PROVIDER_ID,
  name: "Qwen Portal Provider",
  description: "Bundled Qwen Portal OAuth provider (chat.qwen.ai → portal.qwen.ai)",
  register(api) {
    api.registerProvider(buildQwenPortalProviderPlugin());
  },
});
