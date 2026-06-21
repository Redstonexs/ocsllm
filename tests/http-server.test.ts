import { describe, expect, it } from "bun:test"

import { createApp } from "../src/app"
import { InMemoryAnswerCache } from "../src/cache"
import { createCacheBackedSolver, FakeAnswerProvider } from "../src/solver"

function createTestServer() {
  const app = createApp({
    publicBaseUrl: "http://solver.test",
    solver: createCacheBackedSolver({
      cache: new InMemoryAnswerCache(),
      provider: new FakeAnswerProvider(),
    }),
  })
  const server = Bun.serve({
    port: 0,
    fetch: app.fetch,
  })

  return {
    server,
    baseUrl: server.url.origin,
  }
}

describe("live HTTP service", () => {
  it("answers OCS text requests over HTTP", async () => {
    const { server, baseUrl } = createTestServer()

    try {
      const response = await fetch(`${baseUrl}/api/ocs/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "1+1=?",
          type: "single",
          options: "A.1\nB.2",
        }),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        code: 1,
        question: "1+1=?",
        answer: "B",
      })
    } finally {
      server.stop(true)
    }
  })

  it("answers image solve requests over HTTP", async () => {
    const { server, baseUrl } = createTestServer()

    try {
      const response = await fetch(`${baseUrl}/api/solve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "image",
          title: "Read the image",
          type: "single",
          options: ["A. 1", "B. 2"],
          images: [{ kind: "url", url: "https://example.com/question.png" }],
        }),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        answer: "B",
        inputKind: "image",
        source: "llm",
      })
    } finally {
      server.stop(true)
    }
  })

  it("returns public validation errors over HTTP", async () => {
    const { server, baseUrl } = createTestServer()

    try {
      const response = await fetch(`${baseUrl}/api/solve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body).toEqual({
        error: {
          code: "validation_error",
          message: "Request body must be valid JSON.",
        },
      })
      expect(JSON.stringify(body).toLowerCase()).not.toContain("stack")
    } finally {
      server.stop(true)
    }
  })
})
