import { describe, expect, it, vi } from "vitest";

import {
  deleteApiKey,
  getAiSettings,
  getDecryptedApiKey,
  getMonthlyUsage,
  isUnderCap,
  recordRun,
  saveApiKey,
} from "@/features/ai/data";
import { decryptApiKey } from "@/lib/ai/crypto";

const secret = "0123456789abcdef0123456789abcdef";
const validKey = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123";

type QueryResult = { data: unknown; error: unknown };

function fakeSupabase(results: QueryResult[], rpc = vi.fn()) {
  const queue = [...results];
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of ["from", "select", "eq", "maybeSingle", "upsert", "update", "insert", "single"]) {
    builder[method] = vi.fn(chain);
  }
  builder.then = (resolve: (value: QueryResult) => void) =>
    Promise.resolve(queue.shift() ?? { data: null, error: null }).then(resolve);
  return { client: { ...builder, rpc } as never, builder, rpc };
}

describe("getAiSettings", () => {
  it("falls back to defaults without a row", async () => {
    const { client } = fakeSupabase([{ data: null, error: null }]);
    await expect(getAiSettings(client, "u")).resolves.toEqual({
      enabled: false,
      provider: "anthropic",
      keyHint: "",
      monthlyTokenCap: 0,
    });
  });

  it("maps a stored row and never exposes ciphertext", async () => {
    const { client, builder } = fakeSupabase([
      { data: { enabled: true, provider: "openai", key_hint: "a1b2", monthly_token_cap: 5000 }, error: null },
    ]);
    const settings = await getAiSettings(client, "u");
    expect(settings).toEqual({ enabled: true, provider: "openai", keyHint: "a1b2", monthlyTokenCap: 5000 });
    expect(builder.select).toHaveBeenCalledWith("enabled, provider, key_hint, monthly_token_cap");
  });
});

describe("saveApiKey", () => {
  it("refuses when the deployment has no encryption secret", async () => {
    const { client } = fakeSupabase([]);
    await expect(saveApiKey(client, "u", "anthropic", validKey, null)).resolves.toEqual({
      ok: false,
      reason: "unconfigured",
    });
  });

  it("rejects malformed keys before calling the API, per provider pattern", async () => {
    const verify = vi.fn();
    const { client } = fakeSupabase([]);
    await expect(saveApiKey(client, "u", "anthropic", "not-a-key", secret, verify)).resolves.toEqual({
      ok: false,
      reason: "malformed",
    });
    await expect(saveApiKey(client, "u", "anthropic", "sk-proj-abcdefghijklmnopqrstuvwxyz", secret, verify)).resolves.toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it("accepts an OpenAI-shaped key for the openai provider", async () => {
    const { client, builder } = fakeSupabase([{ data: null, error: null }]);
    const result = await saveApiKey(client, "u", "openai", "sk-proj-abcdefghijklmnopqrstuvwxyz9876", secret, async () => "valid");
    expect(result).toEqual({ ok: true, keyHint: "9876" });
    expect((builder.upsert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({ provider: "openai" });
  });

  it("does not store a key the API rejects", async () => {
    const { client, builder } = fakeSupabase([]);
    const result = await saveApiKey(client, "u", "anthropic", validKey, secret, async () => "invalid");
    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(builder.upsert).not.toHaveBeenCalled();
  });

  it("stores only ciphertext plus a hint for a valid key", async () => {
    const { client, builder } = fakeSupabase([{ data: null, error: null }]);
    const result = await saveApiKey(client, "u", "anthropic", " " + validKey + " ", secret, async () => "valid");
    expect(result).toEqual({ ok: true, keyHint: "0123" });

    const upsert = builder.upsert as ReturnType<typeof vi.fn>;
    const [payload, options] = upsert.mock.calls[0] as [Record<string, string | boolean>, unknown];
    expect(options).toEqual({ onConflict: "user_id" });
    expect(payload).toMatchObject({ user_id: "u", enabled: true, provider: "anthropic", key_hint: "0123" });
    expect(payload.encrypted_key).not.toContain(validKey);
    expect(decryptApiKey(String(payload.encrypted_key), secret)).toBe(validKey);
  });
});

describe("getDecryptedApiKey", () => {
  it("returns null when AI is disabled", async () => {
    const { client } = fakeSupabase([{ data: { enabled: false, provider: "anthropic", encrypted_key: null }, error: null }]);
    await expect(getDecryptedApiKey(client, "u", secret)).resolves.toBeNull();
  });

  it("decrypts a stored key", async () => {
    const { client: writer, builder } = fakeSupabase([{ data: null, error: null }]);
    await saveApiKey(writer, "u", "anthropic", validKey, secret, async () => "valid");
    const stored = (builder.upsert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].encrypted_key;

    const { client } = fakeSupabase([{ data: { enabled: true, provider: "anthropic", encrypted_key: stored }, error: null }]);
    await expect(getDecryptedApiKey(client, "u", secret)).resolves.toEqual({ provider: "anthropic", apiKey: validKey });
  });
});

describe("deleteApiKey", () => {
  it("disables and clears the row", async () => {
    const { client, builder } = fakeSupabase([{ data: null, error: null }]);
    await expect(deleteApiKey(client, "u")).resolves.toBe(true);
    expect(builder.update).toHaveBeenCalledWith({ enabled: false, encrypted_key: null, key_hint: "" });
  });
});

describe("usage and cap", () => {
  it("maps monthly usage, coercing bigint strings", async () => {
    const rpc = vi.fn(() => ({
      single: async () => ({
        data: { run_count: 3, input_tokens: "1200", cache_read_tokens: "300", output_tokens: "800" },
        error: null,
      }),
    }));
    const { client } = fakeSupabase([], rpc);
    await expect(getMonthlyUsage(client)).resolves.toEqual({
      runCount: 3,
      inputTokens: 1200,
      cacheReadTokens: 300,
      outputTokens: 800,
    });
  });

  it("treats anything but true as over cap", async () => {
    const under = fakeSupabase([], vi.fn().mockResolvedValue({ data: true, error: null }));
    const over = fakeSupabase([], vi.fn().mockResolvedValue({ data: null, error: null }));
    await expect(isUnderCap(under.client)).resolves.toBe(true);
    await expect(isUnderCap(over.client)).resolves.toBe(false);
  });
});

describe("recordRun", () => {
  it("inserts usage with zero defaults and returns the id", async () => {
    const { client, builder } = fakeSupabase([{ data: { id: "run-1" }, error: null }]);
    await expect(
      recordRun(client, "u", { kind: "query", provider: "anthropic", model: "claude-opus-5", status: "succeeded", usage: { inputTokens: 10 } }),
    ).resolves.toBe("run-1");
    expect(builder.insert).toHaveBeenCalledWith({
      owner_id: "u",
      kind: "query",
      provider: "anthropic",
      model: "claude-opus-5",
      status: "succeeded",
      input_tokens: 10,
      cache_read_tokens: 0,
      output_tokens: 0,
    });
  });
});
