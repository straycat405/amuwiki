import { describe, expect, it } from "vitest";

import { apiKeyHint, decryptApiKey, encryptApiKey } from "@/lib/ai/crypto";
import { estimateCostUsd } from "@/lib/ai/pricing";

const secret = "0123456789abcdef0123456789abcdef";

describe("api key encryption", () => {
  it("round-trips a key and never stores it in the clear", () => {
    const plain = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz";
    const cipher = encryptApiKey(plain, secret);
    expect(cipher.startsWith("v1.")).toBe(true);
    expect(cipher).not.toContain(plain);
    expect(cipher).not.toContain("api03");
    expect(decryptApiKey(cipher, secret)).toBe(plain);
  });

  it("uses a fresh IV per encryption", () => {
    const plain = "sk-ant-api03-same";
    expect(encryptApiKey(plain, secret)).not.toBe(encryptApiKey(plain, secret));
  });

  it("rejects a wrong secret and tampered ciphertext", () => {
    const cipher = encryptApiKey("sk-ant-api03-key", secret);
    expect(() => decryptApiKey(cipher, "another-secret-another-secret-00")).toThrow();
    const [v, iv, tag, data = ""] = cipher.split(".");
    const flipped = data.at(0) === "A" ? "B" : "A";
    expect(() => decryptApiKey(`${v}.${iv}.${tag}.${flipped}${data.slice(1)}`, secret)).toThrow();
  });

  it("refuses unknown formats", () => {
    expect(() => decryptApiKey("v9.a.b.c", secret)).toThrow("unsupported_ciphertext");
    expect(() => decryptApiKey("garbage", secret)).toThrow("unsupported_ciphertext");
  });

  it("hints with the last four characters only", () => {
    expect(apiKeyHint("sk-ant-api03-xyz-a1b2")).toBe("a1b2");
  });
});

describe("estimateCostUsd", () => {
  it("prices input, cached input at 10%, and output", () => {
    const cost = estimateCostUsd(
      { inputTokens: 1_000_000, cacheReadTokens: 1_000_000, outputTokens: 1_000_000 },
      "claude-opus-5",
    );
    expect(cost).toBeCloseTo(5 + 0.5 + 25, 6);
  });

  it("returns null for unknown models", () => {
    expect(estimateCostUsd({ inputTokens: 1, cacheReadTokens: 0, outputTokens: 0 }, "x")).toBeNull();
  });
});
