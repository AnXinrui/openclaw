import type { ModelProviderConfig } from "openclaw/plugin-sdk/provider-models";

export const QWEN_PORTAL_BASE_URL = "https://portal.qwen.ai/v1";
export const QWEN_PORTAL_DEFAULT_MODEL_ID = "coder-model";

const QWEN_PORTAL_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export function buildQwenPortalProvider(): ModelProviderConfig {
  return {
    baseUrl: QWEN_PORTAL_BASE_URL,
    api: "openai-completions",
    models: [
      {
        id: QWEN_PORTAL_DEFAULT_MODEL_ID,
        name: "Qwen Coder",
        reasoning: false,
        input: ["text"],
        cost: QWEN_PORTAL_COST,
        contextWindow: 128_000,
        maxTokens: 8192,
      },
    ],
  };
}

export const QWEN_PORTAL_DEFAULT_MODEL_REF = `qwen-portal/${QWEN_PORTAL_DEFAULT_MODEL_ID}`;
