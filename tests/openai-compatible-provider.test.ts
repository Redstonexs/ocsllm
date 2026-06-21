import { afterEach, describe, expect, it } from "bun:test"

import { OpenAiCompatibleAnswerProvider } from "../src/openai-compatible-provider"
import type { SolveRequest } from "../src/solver"

const ORIGINAL_FETCH = globalThis.fetch

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
})

describe("OpenAiCompatibleAnswerProvider", () => {
  it("calls a chat-completions endpoint for text questions", async () => {
    const calls: CapturedFetchCall[] = []
    installFetchStub(calls)
    const provider = new OpenAiCompatibleAnswerProvider({
      baseUrl: "https://llm.example/v1",
      apiKey: "test-key",
      model: "vision-model",
    })

    const result = await provider.solve({
      kind: "text",
      title: "1+1=?",
      type: "single",
      options: ["A. 1", "B. 2"],
    })

    expect(result).toEqual({
      ok: true,
      value: {
        answer: "B",
        reasoningSummary: "The model selected B.",
        confidence: 0.91,
      },
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe("https://llm.example/v1/chat/completions")
    expect(calls[0]?.init.method).toBe("POST")
    expect(calls[0]?.headers.authorization).toBe("Bearer test-key")
    expect(calls[0]?.body).toMatchObject({
      model: "vision-model",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system" },
        {
          role: "user",
          content: expect.stringContaining("Title: 1+1=?"),
        },
      ],
    })
  })

  it("sends image questions as multimodal chat content", async () => {
    const calls: CapturedFetchCall[] = []
    installFetchStub(calls)
    const provider = new OpenAiCompatibleAnswerProvider({
      baseUrl: "https://llm.example/v1/chat/completions",
      model: "vision-model",
    })
    const request = {
      kind: "image",
      title: "Read the chart",
      type: "single",
      options: ["A. Up", "B. Down"],
      images: [
        { kind: "url", url: " https://cdn.example/chart.png " },
        { kind: "base64", mimeType: "image/png", imageBase64: "aW1h Z2U=" },
      ],
    } as const satisfies SolveRequest

    const result = await provider.solve(request)

    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe("https://llm.example/v1/chat/completions")
    expect(calls[0]?.headers.authorization).toBeUndefined()
    expect(calls[0]?.body).toMatchObject({
      messages: [
        { role: "system" },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: expect.stringContaining("Title: Read the chart"),
            },
            {
              type: "image_url",
              image_url: { url: "https://cdn.example/chart.png" },
            },
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,aW1hZ2U=" },
            },
          ],
        },
      ],
    })
  })

  it("returns a provider failure when the response is not a structured answer", async () => {
    globalThis.fetch = createFetchStub(async () =>
      Response.json({
        choices: [{ message: { content: "not json" } }],
      }),
    )
    const provider = new OpenAiCompatibleAnswerProvider({
      baseUrl: "https://llm.example/v1",
      model: "vision-model",
    })

    const result = await provider.solve({
      kind: "text",
      title: "1+1=?",
      type: "single",
    })

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "provider_failure",
        providerName: "openai-compatible",
        message: "provider execution failed",
        cacheStatus: "miss",
      },
    })
  })

  it("can call an OpenAI-compatible endpoint over HTTP", async () => {
    const captured: {
      authorization: string | null
      body: unknown
    } = {
      authorization: null,
      body: undefined,
    }
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        captured.authorization = request.headers.get("authorization")
        captured.body = await request.json()
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "B",
                  reasoningSummary: "Local compatible endpoint selected B.",
                  confidence: 0.88,
                }),
              },
            },
          ],
        })
      },
    })

    try {
      const provider = new OpenAiCompatibleAnswerProvider({
        baseUrl: server.url.origin,
        apiKey: "test-key",
        model: "network-model",
      })

      const result = await provider.solve({
        kind: "text",
        title: "1+1=?",
        type: "single",
        options: ["A. 1", "B. 2"],
      })

      expect(result).toMatchObject({
        ok: true,
        value: {
          answer: "B",
          confidence: 0.88,
        },
      })
      expect(captured.authorization).toBe("Bearer test-key")
      expect(captured.body).toMatchObject({
        model: "network-model",
        messages: [
          { role: "system" },
          {
            role: "user",
            content: expect.stringContaining("Title: 1+1=?"),
          },
        ],
      })
    } finally {
      server.stop(true)
    }
  })
})

type CapturedFetchCall = {
  readonly url: string
  readonly init: NonNullable<Parameters<typeof fetch>[1]>
  readonly headers: CapturedHeaders
  readonly body: unknown
}

type CapturedHeaders = Record<string, string> & {
  readonly authorization?: string
}

function installFetchStub(calls: CapturedFetchCall[]): void {
  globalThis.fetch = createFetchStub(async (input, init) => {
    if (init === undefined) {
      throw new Error("Expected fetch init.")
    }

    calls.push({
      url: String(input),
      init,
      headers: readHeaders(init.headers),
      body: JSON.parse(String(init.body)),
    })

    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: "B",
              reasoningSummary: "The model selected B.",
              confidence: 0.91,
            }),
          },
        },
      ],
    })
  })
}

type FetchStub = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => Promise<Response>

function createFetchStub(stub: FetchStub): typeof fetch {
  return Object.assign(stub, { preconnect: ORIGINAL_FETCH.preconnect })
}

type HeaderInput = ConstructorParameters<typeof Headers>[0]

function readHeaders(headers: HeaderInput | undefined): CapturedHeaders {
  if (headers === undefined) {
    return {}
  }

  return Object.fromEntries(new Headers(headers).entries())
}
