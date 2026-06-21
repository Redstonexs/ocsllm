import { describe, expect, it } from "bun:test"

import {
  MAX_IMAGE_BYTES,
  OcsTextRequestSchema,
  PublicErrorPayloadSchema,
  parseOcsOptions,
  SolveRequestSchema,
  StructuredAnswerSchema,
} from "../src/schemas"

const BASE64_ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

function assertNever(value: never): never {
  throw new Error(`Unexpected solve request kind: ${JSON.stringify(value)}`)
}

describe("OCS text request schema", () => {
  it("parses a valid text payload when OCS sends option text", () => {
    // Given: an OCS-style text request with newline-delimited options.
    const payload = {
      title: "1+1=?",
      type: "single",
      options: "A.1\nB.2",
    } as const

    // When: the payload crosses the schema boundary.
    const result = OcsTextRequestSchema.safeParse(payload)

    // Then: the parsed request has normalized readonly option values.
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        title: "1+1=?",
        type: "single",
        options: ["A.1", "B.2"],
      })
      expect(Object.isFrozen(result.data)).toBe(true)
    }
  })

  it("rejects missing or empty titles when OCS text input is malformed", () => {
    // Given: OCS payloads with missing and blank titles.
    const missingTitlePayload = { type: "single", options: "A.1\nB.2" } as const
    const emptyTitlePayload = { title: "   ", type: "single", options: "A.1\nB.2" } as const

    // When: each payload crosses the schema boundary.
    const missingTitleResult = OcsTextRequestSchema.safeParse(missingTitlePayload)
    const emptyTitleResult = OcsTextRequestSchema.safeParse(emptyTitlePayload)

    // Then: neither payload is accepted as a typed OCS text request.
    expect(missingTitleResult.success).toBe(false)
    expect(emptyTitleResult.success).toBe(false)
  })
})

describe("direct solve request schema", () => {
  it("parses a valid text solve payload when no images are present", () => {
    // Given: a direct text solve request.
    const payload = {
      kind: "text",
      title: "Capital of France?",
      type: "single",
      options: ["A. Berlin", "B. Paris"],
    } as const

    // When: the request crosses the schema boundary.
    const result = SolveRequestSchema.safeParse(payload)

    // Then: the parsed request keeps the text discriminant and frozen object shape.
    expect(result.success).toBe(true)
    if (!result.success) {
      throw new Error("Expected text solve request to parse.")
    }

    switch (result.data.kind) {
      case "text":
        expect(result.data.options).toEqual(["A. Berlin", "B. Paris"])
        expect(Object.isFrozen(result.data)).toBe(true)
        break
      case "image":
        throw new Error("Expected text solve request.")
      default:
        assertNever(result.data)
    }
  })

  it("parses a valid image URL payload when one URL image is supplied", () => {
    // Given: a direct image solve request using an image URL input.
    const payload = {
      kind: "image",
      title: "What does the chart show?",
      type: "single",
      options: ["A. Increase", "B. Decrease"],
      images: [{ kind: "url", url: "https://example.com/question.png" }],
    } as const

    // When: the request crosses the schema boundary.
    const result = SolveRequestSchema.safeParse(payload)

    // Then: the parsed request preserves the image discriminant and URL image.
    expect(result.success).toBe(true)
    if (!result.success) {
      throw new Error("Expected image URL solve request to parse.")
    }

    switch (result.data.kind) {
      case "image":
        expect(result.data.images).toEqual([
          { kind: "url", url: "https://example.com/question.png" },
        ])
        expect(Object.isFrozen(result.data.images)).toBe(true)
        break
      case "text":
        throw new Error("Expected image solve request.")
      default:
        assertNever(result.data)
    }
  })

  it("parses a valid base64 image payload when MIME and size are supported", () => {
    // Given: a direct image solve request using base64 image bytes.
    const payload = {
      kind: "image",
      title: "Read the image",
      type: "single",
      images: [
        {
          kind: "base64",
          mimeType: "image/png",
          imageBase64: BASE64_ONE_PIXEL_PNG,
        },
      ],
    } as const

    // When: the request crosses the schema boundary.
    const result = SolveRequestSchema.safeParse(payload)

    // Then: the parsed request accepts the supported base64 image input.
    expect(result.success).toBe(true)
    if (!result.success) {
      throw new Error("Expected base64 image solve request to parse.")
    }

    switch (result.data.kind) {
      case "image":
        expect(result.data.images).toEqual([
          {
            kind: "base64",
            mimeType: "image/png",
            imageBase64: BASE64_ONE_PIXEL_PNG,
          },
        ])
        break
      case "text":
        throw new Error("Expected image solve request.")
      default:
        assertNever(result.data)
    }
  })

  it("rejects an empty image array when an image solve request has no images", () => {
    // Given: an image solve request with no image evidence.
    const payload = {
      kind: "image",
      title: "Read the image",
      type: "single",
      images: [],
    } as const

    // When: the request crosses the schema boundary.
    const result = SolveRequestSchema.safeParse(payload)

    // Then: image requests must contain at least one image input.
    expect(result.success).toBe(false)
  })

  it("rejects unsupported image MIME values when base64 input is supplied", () => {
    // Given: a base64 image input using SVG, which is intentionally unsupported.
    const payload = {
      kind: "image",
      title: "Read the image",
      type: "single",
      images: [
        {
          kind: "base64",
          mimeType: "image/svg+xml",
          imageBase64: BASE64_ONE_PIXEL_PNG,
        },
      ],
    } as const

    // When: the request crosses the schema boundary.
    const result = SolveRequestSchema.safeParse(payload)

    // Then: unsupported MIME values are rejected.
    expect(result.success).toBe(false)
  })

  it("rejects oversized base64 images when decoded bytes exceed the exported limit", () => {
    // Given: a base64 image payload one byte larger than the exported maximum.
    const oversizedImage = "A".repeat(MAX_IMAGE_BYTES + 1)
    const payload = {
      kind: "image",
      title: "Read the image",
      type: "single",
      images: [
        {
          kind: "base64",
          mimeType: "image/png",
          imageBase64: Buffer.from(oversizedImage).toString("base64"),
        },
      ],
    } as const

    // When: the request crosses the schema boundary.
    const result = SolveRequestSchema.safeParse(payload)

    // Then: payloads above the byte ceiling are rejected.
    expect(result.success).toBe(false)
  })
})

describe("answer and public error schemas", () => {
  it("parses a structured answer when solver metadata is present", () => {
    // Given: a solver answer with user-facing and internal metadata.
    const payload = {
      answer: "B.2",
      reasoningSummary: "Basic arithmetic.",
      confidence: 0.97,
      source: "llm",
      cacheStatus: "miss",
      providerStatus: "success",
      inputKind: "text",
    } as const

    // When: the payload crosses the response schema boundary.
    const result = StructuredAnswerSchema.safeParse(payload)

    // Then: the structured answer is accepted and frozen.
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.answer).toBe("B.2")
      expect(Object.isFrozen(result.data)).toBe(true)
    }
  })

  it("parses a public error payload when validation details are exposed", () => {
    // Given: a public error payload that exposes a machine-readable validation issue.
    const payload = {
      error: {
        code: "validation_error",
        message: "Invalid request payload.",
        issues: [{ path: ["images", 0, "mimeType"], message: "Unsupported image MIME type." }],
      },
    } as const

    // When: the payload crosses the public error schema boundary.
    const result = PublicErrorPayloadSchema.safeParse(payload)

    // Then: the public error shape is accepted without stack traces or raw internals.
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.error.code).toBe("validation_error")
      expect(result.data.error.issues).toEqual([
        { path: ["images", 0, "mimeType"], message: "Unsupported image MIME type." },
      ])
    }
  })
})

describe("parseOcsOptions", () => {
  it("returns trimmed option lines when OCS sends a newline string", () => {
    // Given: option text with blank lines and extra whitespace.
    const optionsText = " A. 1 \n\n B. 2 \r\n C. 3 "

    // When: the OCS option text is normalized.
    const options = parseOcsOptions(optionsText)

    // Then: only filled option lines remain.
    expect(options).toEqual(["A. 1", "B. 2", "C. 3"])
  })
})
