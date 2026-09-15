import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
});

const serverEnvSchema = publicEnvSchema.extend({
  OWNER_EMAIL: z.email(),
});

const aiEnvSchema = z.object({
  AI_ANTHROPIC_MODEL: z.string().trim().min(1).default("claude-opus-5"),
  AI_OPENAI_MODEL: z.string().trim().min(1).default("gpt-5-mini"),
  AI_KEY_ENCRYPTION_SECRET: z.string().min(32).optional(),
});

export type AiServerEnv = {
  /** Operator-pinned model per provider; users pick the provider, not the model. */
  models: { anthropic: string; openai: string };
  /** Null when AI features are not configured for this deployment. */
  encryptionSecret: string | null;
};

export function getPublicEnv() {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
}

export function getServerEnv() {
  return serverEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    OWNER_EMAIL: process.env.OWNER_EMAIL,
  });
}

export function getAiServerEnv(): AiServerEnv {
  const parsed = aiEnvSchema.parse({
    AI_ANTHROPIC_MODEL: process.env.AI_ANTHROPIC_MODEL || undefined,
    AI_OPENAI_MODEL: process.env.AI_OPENAI_MODEL || undefined,
    AI_KEY_ENCRYPTION_SECRET: process.env.AI_KEY_ENCRYPTION_SECRET || undefined,
  });
  return {
    models: { anthropic: parsed.AI_ANTHROPIC_MODEL, openai: parsed.AI_OPENAI_MODEL },
    encryptionSecret: parsed.AI_KEY_ENCRYPTION_SECRET ?? null,
  };
}
