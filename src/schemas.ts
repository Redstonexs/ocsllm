import { z } from "zod"

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const

const ANSWER_SOURCES = ["cache", "llm", "fallback"] as const
const CACHE_STATUSES = ["hit", "miss", "bypass"] as const
const PROVIDER_STATUSES = ["success", "skipped", "failed"] as const
const PUBLIC_ERROR_CODES = [
  "validation_error",
  "solver_error",
  "not_found",
  "internal_error",
] as const

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

const NonEmptyTrimmedStringSchema = z.string().trim().min(1)
const QuestionTypeSchema = NonEmptyTrimmedStringSchema
const DirectOptionsSchema = z.array(NonEmptyTrimmedStringSchema).readonly()

export function parseOcsOptions(options: string): readonly string[] {
  return Object.freeze(
    options
      .split(/\r?\n/)
      .map((option) => option.trim())
      .filter((option) => option.length > 0),
  )
}

function decodedBase64ByteLength(encoded: string): number | undefined {
  const compact = encoded.replace(/\s/g, "")

  if (compact.length === 0 || compact.length % 4 !== 0 || !BASE64_PATTERN.test(compact)) {
    return undefined
  }

  if (compact.endsWith("==")) {
    return (compact.length / 4) * 3 - 2
  }

  if (compact.endsWith("=")) {
    return (compact.length / 4) * 3 - 1
  }

  return (compact.length / 4) * 3
}

const Base64ImageDataSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => decodedBase64ByteLength(value) !== undefined, {
    error: "Image data must be valid base64.",
  })
  .refine(
    (value) => {
      const byteLength = decodedBase64ByteLength(value)
      return byteLength !== undefined && byteLength <= MAX_IMAGE_BYTES
    },
    { error: `Image data must be ${MAX_IMAGE_BYTES} bytes or smaller.` },
  )

const OcsOptionsSchema = z.union([
  z.string().transform(parseOcsOptions),
  z.array(NonEmptyTrimmedStringSchema).readonly(),
])

export const OcsTextRequestSchema = z
  .object({
    title: NonEmptyTrimmedStringSchema,
    type: QuestionTypeSchema,
    options: OcsOptionsSchema,
  })
  .readonly()

const UrlImageInputSchema = z
  .object({
    kind: z.literal("url"),
    url: z.string().url(),
  })
  .readonly()

const Base64ImageInputSchema = z
  .object({
    kind: z.literal("base64"),
    mimeType: z.enum(SUPPORTED_IMAGE_MIME_TYPES),
    imageBase64: Base64ImageDataSchema,
  })
  .readonly()

export const ImageInputSchema = z.discriminatedUnion("kind", [
  UrlImageInputSchema,
  Base64ImageInputSchema,
])

const RawTextSolveRequestSchema = z.object({
  kind: z.literal("text"),
  title: NonEmptyTrimmedStringSchema,
  type: QuestionTypeSchema,
  options: DirectOptionsSchema.optional(),
})

const RawImageSolveRequestSchema = z.object({
  kind: z.literal("image"),
  title: NonEmptyTrimmedStringSchema,
  type: QuestionTypeSchema,
  options: DirectOptionsSchema.optional(),
  images: z.array(ImageInputSchema).min(1).readonly(),
})

export const TextSolveRequestSchema = RawTextSolveRequestSchema.readonly()
export const ImageSolveRequestSchema = RawImageSolveRequestSchema.readonly()
export const SolveRequestSchema = z
  .discriminatedUnion("kind", [RawTextSolveRequestSchema, RawImageSolveRequestSchema])
  .readonly()

export const StructuredAnswerSchema = z
  .object({
    answer: NonEmptyTrimmedStringSchema,
    reasoningSummary: z.string().trim(),
    confidence: z.number().min(0).max(1),
    source: z.enum(ANSWER_SOURCES),
    cacheStatus: z.enum(CACHE_STATUSES),
    providerStatus: z.enum(PROVIDER_STATUSES),
    inputKind: z.enum(["text", "image"] as const),
  })
  .readonly()

const PublicErrorIssueSchema = z
  .object({
    path: z.array(z.union([z.string(), z.number().int().nonnegative()])).readonly(),
    message: NonEmptyTrimmedStringSchema,
  })
  .readonly()

export const PublicErrorPayloadSchema = z
  .object({
    error: z
      .object({
        code: z.enum(PUBLIC_ERROR_CODES),
        message: NonEmptyTrimmedStringSchema,
        issues: z.array(PublicErrorIssueSchema).readonly().optional(),
      })
      .readonly(),
  })
  .readonly()

export type OcsTextRequest = z.infer<typeof OcsTextRequestSchema>
export type ImageInput = z.infer<typeof ImageInputSchema>
export type TextSolveRequest = z.infer<typeof TextSolveRequestSchema>
export type ImageSolveRequest = z.infer<typeof ImageSolveRequestSchema>
export type SolveRequest = z.infer<typeof SolveRequestSchema>
export type StructuredAnswer = z.infer<typeof StructuredAnswerSchema>
export type PublicErrorPayload = z.infer<typeof PublicErrorPayloadSchema>
