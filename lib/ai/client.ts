import Anthropic from "@anthropic-ai/sdk";

export type KeyVerification = "valid" | "invalid" | "unreachable";

/** One client per request with the caller's own key; never share an instance across users. */
export function createAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: 1 });
}

export async function verifyApiKey(apiKey: string): Promise<KeyVerification> {
  try {
    await createAnthropicClient(apiKey).models.list({ limit: 1 });
    return "valid";
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return "invalid";
    if (error instanceof Anthropic.PermissionDeniedError) return "invalid";
    return "unreachable";
  }
}
