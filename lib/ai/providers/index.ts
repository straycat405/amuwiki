import type { AiProvider, AiProviderId } from "@/lib/ai/provider";
import { anthropicProvider } from "@/lib/ai/providers/anthropic";
import { openaiProvider } from "@/lib/ai/providers/openai";

const providers: Record<AiProviderId, AiProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
};

export function getAiProvider(id: AiProviderId): AiProvider {
  return providers[id];
}

export function listAiProviders(): AiProvider[] {
  return Object.values(providers);
}
