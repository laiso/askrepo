export interface ModelProvider {
  name: string;
  baseUrl?: string;
  models: string[];
  apiKeyEnvVar: string;
}

export const PROVIDERS: Record<string, ModelProvider> = {
  GOOGLE: {
    name: "google",
    baseUrl:
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    models: [
      "gemini-2.0-flash",
      "gemini-2.0-pro",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
    ],
    apiKeyEnvVar: "GOOGLE_API_KEY",
  },
  OPENAI: {
    name: "openai",
    baseUrl: "https://api.openai.com/v1/chat/completions",
    models: ["gpt-4", "gpt-4o", "gpt-3.5-turbo"],
    apiKeyEnvVar: "OPENAI_API_KEY",
  },
  ANTHROPIC: {
    name: "anthropic",
    models: ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"],
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
  },
  MISTRAL: {
    name: "mistral",
    models: ["mistral-large", "mistral-medium", "mistral-small"],
    apiKeyEnvVar: "MISTRAL_API_KEY",
  },
};

export function detectProviderFromModel(
  model: string,
): ModelProvider | undefined {
  for (const provider of Object.values(PROVIDERS)) {
    if (
      provider.models.includes(model) || model.startsWith(`${provider.name}/`)
    ) {
      return provider;
    }
  }
  return undefined;
}

export function getApiKeyFromProvider(provider: ModelProvider): string {
  const apiKey = Deno.env.get(provider.apiKeyEnvVar);
  if (!apiKey) {
    throw new Error(`${provider.apiKeyEnvVar} environment variable not set`);
  }
  return apiKey;
}
