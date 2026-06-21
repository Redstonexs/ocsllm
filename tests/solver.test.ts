import { describe, expect, it } from "bun:test"

import { InMemoryAnswerCache } from "../src/cache"
import {
  createCacheBackedSolver,
  FakeAnswerProvider,
  type ProviderFailure,
  type SolveRequest,
} from "../src/solver"

const TEXT_REQUEST = {
  kind: "text",
  title: "What is 2 + 2?",
  type: "single",
  options: ["A. 3", "B. 4"],
} as const satisfies SolveRequest

describe("cache-backed solver orchestration", () => {
  it("calls the fake provider once when the answer is not cached", async () => {
    // Given: an empty answer cache and a fake provider with a deterministic answer.
    const fake = new FakeAnswerProvider({
      answer: {
        answer: "B",
        reasoningSummary: "2 + 2 equals 4.",
        confidence: 0.99,
      },
    })
    const solver = createCacheBackedSolver({
      cache: new InMemoryAnswerCache(),
      provider: fake,
    })

    // When: the solver handles a question that is not already cached.
    const result = await solver.solve(TEXT_REQUEST)

    // Then: the provider is called once and the result reports a cache miss.
    expect(result.ok).toBe(true)
    expect(result).toMatchObject({
      ok: true,
      value: {
        answer: "B",
        cacheStatus: "miss",
        source: "llm",
      },
    })
    expect(fake.calls).toHaveLength(1)
  })

  it("uses the cache when the same question is solved again", async () => {
    // Given: a cache-backed solver that has already solved a question once.
    const fake = new FakeAnswerProvider()
    const solver = createCacheBackedSolver({
      cache: new InMemoryAnswerCache(),
      provider: fake,
    })

    // When: the same question is solved twice.
    const first = await solver.solve(TEXT_REQUEST)
    const second = await solver.solve(TEXT_REQUEST)

    // Then: only the first call reaches the provider.
    expect(first).toMatchObject({ ok: true, value: { cacheStatus: "miss" } })
    expect(second).toMatchObject({ ok: true, value: { cacheStatus: "hit" } })
    expect(fake.calls).toHaveLength(1)
  })

  it("uses the same cache key for normalized equivalent text questions", async () => {
    // Given: two text requests that differ only by whitespace, casing, and option spacing.
    const fake = new FakeAnswerProvider()
    const solver = createCacheBackedSolver({
      cache: new InMemoryAnswerCache(),
      provider: fake,
    })
    const noisyRequest = {
      kind: "text",
      title: "  WHAT   is 2 + 2? ",
      type: "Single",
      options: [" A. 3 ", "B.   4"],
    } as const satisfies SolveRequest
    const normalizedRequest = {
      kind: "text",
      title: "what is 2 + 2?",
      type: "single",
      options: ["a. 3", " b. 4 "],
    } as const satisfies SolveRequest

    // When: the normalized-equivalent requests are solved in sequence.
    const first = await solver.solve(noisyRequest)
    const second = await solver.solve(normalizedRequest)

    // Then: the second solve reuses the first cached answer.
    expect(first).toMatchObject({ ok: true, value: { cacheStatus: "miss" } })
    expect(second).toMatchObject({ ok: true, value: { cacheStatus: "hit" } })
    expect(fake.calls).toHaveLength(1)
  })

  it("returns a typed failure when the provider fails", async () => {
    // Given: a fake provider configured to fail without throwing through the seam.
    const failure = {
      kind: "provider_failure",
      providerName: "fake",
      message: "provider unavailable",
      cacheStatus: "miss",
    } as const satisfies ProviderFailure
    const fake = new FakeAnswerProvider({ failure })
    const solver = createCacheBackedSolver({
      cache: new InMemoryAnswerCache(),
      provider: fake,
    })

    // When: the solver tries to answer a cache miss.
    const result = await solver.solve(TEXT_REQUEST)

    // Then: the failure is a typed result, not a raw thrown provider error.
    expect(result).toEqual({ ok: false, error: failure })
    expect(fake.calls).toHaveLength(1)
  })

  it("passes image information through the solver seam", async () => {
    // Given: an image-containing request and a fake provider that records calls.
    const imageRequest = {
      kind: "image",
      title: "What equation is shown?",
      type: "single",
      options: ["A. 2", "B. 4"],
      images: [
        { kind: "url", url: "https://example.com/question.png" },
        { kind: "base64", mimeType: "image/png", imageBase64: "aW1hZ2U=" },
      ],
    } as const satisfies SolveRequest
    const fake = new FakeAnswerProvider()
    const solver = createCacheBackedSolver({
      cache: new InMemoryAnswerCache(),
      provider: fake,
    })

    // When: the image request is solved through the cache-backed seam.
    const result = await solver.solve(imageRequest)

    // Then: the provider receives the full image request unchanged.
    expect(result).toMatchObject({ ok: true, value: { inputKind: "image" } })
    expect(fake.calls).toEqual([imageRequest])
  })
})
