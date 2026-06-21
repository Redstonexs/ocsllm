import { describe, expect, it } from "bun:test"

import { createApp } from "../src/app"
import { InMemoryAnswerCache } from "../src/cache"
import {
  createCacheBackedSolver,
  FakeAnswerProvider,
  type FakeAnswerProviderConfig,
  type ProviderFailure,
} from "../src/solver"

const DEFAULT_PUBLIC_BASE_URL = "http://solver.test"
const PLACEHOLDER_PREFIX = "$"

function createTestApp(providerConfig: FakeAnswerProviderConfig = {}) {
  const provider = new FakeAnswerProvider(providerConfig)
  return createApp({
    publicBaseUrl: DEFAULT_PUBLIC_BASE_URL,
    solver: createCacheBackedSolver({
      cache: new InMemoryAnswerCache(),
      provider,
    }),
  })
}

describe("GET /health", () => {
  it("returns ok status when the service is healthy", async () => {
    // Given: a service app with the health route registered.
    const app = createTestApp()

    // When: the health endpoint is requested.
    const response = await app.request("/health")

    // Then: the observable HTTP contract reports a healthy service.
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{"status":"ok"}')
  })
})

describe("not found", () => {
  it("returns a JSON error when no route matches", async () => {
    // Given: a service app without a matching route for this request.
    const app = createTestApp()

    // When: an unknown endpoint is requested.
    const response = await app.request("/missing")

    // Then: the observable HTTP contract reports a not-found error.
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Route not found." },
    })
  })
})

describe("CORS", () => {
  it("allows browser preflight requests from OCS pages", async () => {
    // Given: a browser page making a cross-origin JSON request to the local service.
    const app = createTestApp()

    // When: the browser sends the preflight request.
    const response = await app.request("/api/solve", {
      method: "OPTIONS",
      headers: {
        origin: "https://course.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    })

    // Then: the service explicitly allows the bridge request to proceed.
    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    expect(response.headers.get("access-control-allow-methods")).toContain("POST")
    expect(response.headers.get("access-control-allow-headers")).toContain("content-type")
  })

  it("adds CORS headers to solved answers", async () => {
    // Given: the userscript bridge is calling from a course page origin.
    const app = createTestApp()

    // When: the bridge posts a normal solve request.
    const response = await app.request("/api/solve", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://course.example",
      },
      body: JSON.stringify({
        kind: "text",
        title: "1+1=?",
        type: "single",
        options: ["A.1", "B.2"],
      }),
    })

    // Then: the browser can read the response body.
    expect(response.status).toBe(200)
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
  })
})

describe("GET /api/ocs/config", () => {
  it("returns an OCS AnswererWrapper-compatible configuration", async () => {
    // Given: a service app with a known public base URL.
    const app = createTestApp()

    // When: the generated OCS config is requested.
    const response = await app.request("/api/ocs/config")

    // Then: OCS can subscribe to a text question-bank answerer.
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      {
        name: "OCS LLM Solver",
        homepage: `${DEFAULT_PUBLIC_BASE_URL}/health`,
        url: `${DEFAULT_PUBLIC_BASE_URL}/api/ocs/answer`,
        method: "post",
        contentType: "json",
        data: {
          title: `${PLACEHOLDER_PREFIX}{title}`,
          type: `${PLACEHOLDER_PREFIX}{type}`,
          options: `${PLACEHOLDER_PREFIX}{options}`,
        },
        handler:
          "return res.code === 1 ? [res.question, res.answer] : [res.msg || 'No answer', undefined]",
      },
    ])
  })
})

describe("POST /api/ocs/answer", () => {
  it("solves an OCS text question and returns a handler-friendly answer", async () => {
    // Given: an OCS-style text payload with newline-delimited options.
    const app = createTestApp()

    // When: OCS posts the question to the answer endpoint.
    const response = await app.request("/api/ocs/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "1+1=?",
        type: "single",
        options: "A.1\nB.2",
      }),
    })

    // Then: the response shape can be consumed by the generated handler.
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      code: 1,
      question: "1+1=?",
      answer: "B",
      data: {
        answer: "B",
        cacheStatus: "miss",
        inputKind: "text",
        source: "llm",
      },
    })
  })

  it("returns code 0 when the solver provider fails", async () => {
    // Given: the backing provider cannot produce an answer.
    const failure = {
      kind: "provider_failure",
      providerName: "fake",
      message: "raw provider secret must not leak",
      cacheStatus: "miss",
    } as const satisfies ProviderFailure
    const app = createTestApp({ failure })

    // When: OCS posts a valid question.
    const response = await app.request("/api/ocs/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "1+1=?",
        type: "single",
        options: "A.1\nB.2",
      }),
    })

    // Then: OCS receives a stable no-answer response without provider internals.
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toEqual({
      code: 0,
      msg: "Solver failed to produce an answer.",
    })
    expect(JSON.stringify(body)).not.toContain("secret")
  })

  it("returns validation details for malformed OCS payloads", async () => {
    // Given: an OCS request body without the required title.
    const app = createTestApp()

    // When: the malformed body is posted.
    const response = await app.request("/api/ocs/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "single", options: "A.1\nB.2" }),
    })

    // Then: the client receives a machine-readable validation error.
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { code: "validation_error" },
    })
  })
})

describe("POST /api/solve", () => {
  it("solves a direct text question and reuses the cache on repeated requests", async () => {
    // Given: a direct text solve payload and a shared app cache.
    const app = createTestApp()
    const request = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "text",
        title: "1+1=?",
        type: "single",
        options: ["A.1", "B.2"],
      }),
    } as const

    // When: the same question is solved twice.
    const first = await app.request("/api/solve", request)
    const second = await app.request("/api/solve", request)

    // Then: the first response comes from the LLM seam and the second from cache.
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(await first.json()).toMatchObject({
      answer: "B",
      cacheStatus: "miss",
      inputKind: "text",
      source: "llm",
    })
    expect(await second.json()).toMatchObject({
      answer: "B",
      cacheStatus: "hit",
      inputKind: "text",
      source: "cache",
    })
  })

  it("solves a direct image question using a JSON image URL payload", async () => {
    // Given: a direct image question with a URL image input.
    const app = createTestApp()

    // When: the image payload is posted to the direct solve endpoint.
    const response = await app.request("/api/solve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "image",
        title: "What equation is shown?",
        type: "single",
        options: ["A.2", "B.4"],
        images: [{ kind: "url", url: "https://example.com/q.png" }],
      }),
    })

    // Then: the structured answer records that an image question was solved.
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      answer: "B",
      inputKind: "image",
      providerStatus: "success",
    })
  })

  it("rejects unsupported base64 image MIME values", async () => {
    // Given: an image request with an unsupported SVG MIME value.
    const app = createTestApp()

    // When: the payload crosses the HTTP boundary.
    const response = await app.request("/api/solve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "image",
        title: "Read the image",
        type: "single",
        images: [
          {
            kind: "base64",
            mimeType: "image/svg+xml",
            imageBase64: "aW1hZ2U=",
          },
        ],
      }),
    })

    // Then: the endpoint returns a public validation error.
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { code: "validation_error" },
    })
  })

  it("returns a public solver error when the provider fails", async () => {
    // Given: the backing provider fails with an internal-looking message.
    const failure = {
      kind: "provider_failure",
      providerName: "fake",
      message: "stack trace with secret",
      cacheStatus: "miss",
    } as const satisfies ProviderFailure
    const app = createTestApp({ failure })

    // When: the direct solve endpoint receives a valid request.
    const response = await app.request("/api/solve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "text",
        title: "1+1=?",
        type: "single",
        options: ["A.1", "B.2"],
      }),
    })

    // Then: the public error omits raw provider details.
    const body = await response.json()
    expect(response.status).toBe(502)
    expect(body).toEqual({
      error: {
        code: "solver_error",
        message: "Solver failed to produce an answer.",
      },
    })
    expect(JSON.stringify(body)).not.toContain("secret")
  })

  it("rejects invalid JSON bodies with a public validation error", async () => {
    // Given: a request body that is not valid JSON.
    const app = createTestApp()

    // When: the body is posted to the direct solve endpoint.
    const response = await app.request("/api/solve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    })

    // Then: no stack trace or parser internals are exposed.
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: {
        code: "validation_error",
        message: "Request body must be valid JSON.",
      },
    })
  })
})
