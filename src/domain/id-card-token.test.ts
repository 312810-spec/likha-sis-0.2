import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  generateIdCardToken,
  importIdCardSecretKey,
  verifyIdCardToken,
  type IdCardTokenInput,
} from "./id-card-token";

describe("id-card-token", () => {
  let secretKey: CryptoKey;
  let otherKey: CryptoKey;

  beforeAll(async () => {
    secretKey = await importIdCardSecretKey(new TextEncoder().encode("device-local-secret-1"));
    otherKey = await importIdCardSecretKey(new TextEncoder().encode("a-different-secret"));
  });

  const learner: IdCardTokenInput = {
    schoolId: "school-1",
    learnerId: "learner-1",
    lrn: "123456789012",
  };

  it("generates a deterministic hex token for the same inputs", async () => {
    const first = await generateIdCardToken(secretKey, learner);
    const second = await generateIdCardToken(secretKey, learner);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{32}$/);
  });

  it("produces a different token for a different learner", async () => {
    const tokenA = await generateIdCardToken(secretKey, learner);
    const tokenB = await generateIdCardToken(secretKey, { ...learner, learnerId: "learner-2" });
    expect(tokenA).not.toBe(tokenB);
  });

  it("produces a different token under a different secret key", async () => {
    const tokenA = await generateIdCardToken(secretKey, learner);
    const tokenB = await generateIdCardToken(otherKey, learner);
    expect(tokenA).not.toBe(tokenB);
  });

  it("verifies a correctly generated token", async () => {
    const token = await generateIdCardToken(secretKey, learner);
    await expect(verifyIdCardToken(secretKey, learner, token)).resolves.toBe(true);
  });

  it("rejects a token generated under a different key", async () => {
    const token = await generateIdCardToken(otherKey, learner);
    await expect(verifyIdCardToken(secretKey, learner, token)).resolves.toBe(false);
  });

  it("rejects a token for mismatched learner data (e.g. a tampered/reused card)", async () => {
    const token = await generateIdCardToken(secretKey, learner);
    await expect(
      verifyIdCardToken(secretKey, { ...learner, learnerId: "learner-2" }, token),
    ).resolves.toBe(false);
  });

  it("rejects a malformed/garbled scanned token without throwing", async () => {
    await expect(verifyIdCardToken(secretKey, learner, "not-hex!!")).resolves.toBe(false);
  });

  it("never calls out to any network — verification is a pure recomputation", async () => {
    const fetchSpy = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const token = await generateIdCardToken(secretKey, learner);
      await verifyIdCardToken(secretKey, learner, token);
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
