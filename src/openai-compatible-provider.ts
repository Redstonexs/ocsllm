import { z } from "zod"

import { err, ok, type Result } from "./result"
import {
  type AnswerProvider,
  assertNever,
  createProviderFailure,
  type ImageInput,
  type ProviderAnswer,
  type ProviderFailure,
  type SolveRequest,
} from "./solver"

const WHITESPACE = /\s/g

const ProviderAnswerPayloadSchema = z
  .object({
    answer: z.string().trim().min(1),
    reasoningSummary: z.string().trim(),
    confidence: z.number().min(0).max(1),
  })
  .readonly()

const ChatCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
      }),
    )
    .min(1),
})

export type OpenAiCompatibleAnswerProviderConfig = {
  readonly providerName?: string
  readonly baseUrl: string
  readonly apiKey?: string
  readonly model: string
}

type ChatTextPart = {
  readonly type: "text"
  readonly text: string
}

type ChatImagePart = {
  readonly type: "image_url"
  readonly image_url: {
    readonly url: string
  }
}

type ChatContentPart = ChatTextPart | ChatImagePart

type ChatMessage = {
  readonly role: "system" | "user"
  readonly content: string | readonly ChatContentPart[]
}

type ChatCompletionRequest = {
  readonly model: string
  readonly temperature: 0
  readonly response_format: {
    readonly type: "json_object"
  }
  readonly messages: readonly ChatMessage[]
}

export class OpenAiCompatibleAnswerProvider implements AnswerProvider {
  readonly name: string
  private readonly endpoint: string
  private readonly apiKey: string | undefined
  private readonly model: string

  constructor(config: OpenAiCompatibleAnswerProviderConfig) {
    this.name = config.providerName ?? "openai-compatible"
    this.endpoint = toChatCompletionEndpoint(config.baseUrl)
    this.apiKey = normalizeOptional(config.apiKey)
    this.model = config.model
  }

  async solve(request: SolveRequest): Promise<Result<ProviderAnswer, ProviderFailure>> {
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: this.createHeaders(),
        body: JSON.stringify(createChatCompletionRequest(this.model, request)),
      })

      if (!response.ok) {
        return err(createProviderFailure(this.name))
      }

      const payload: unknown = await response.json()
      const parsed = ChatCompletionResponseSchema.safeParse(payload)

      if (!parsed.success) {
        return err(createProviderFailure(this.name))
      }

      const firstChoice = parsed.data.choices[0]
      if (firstChoice === undefined) {
        return err(createProviderFailure(this.name))
      }

      const answer = parseProviderAnswer(firstChoice.message.content)
      if (!answer.ok) {
        return err(createProviderFailure(this.name))
      }

      return ok(answer.value)
    } catch {
      return err(createProviderFailure(this.name))
    }
  }

  private createHeaders(): Record<string, string> {
    if (this.apiKey === undefined) {
      return { "content-type": "application/json" }
    }

    return {
      "content-type": "application/json",
      authorization: `Bearer ${this.apiKey}`,
    }
  }
}

function createChatCompletionRequest(model: string, request: SolveRequest): ChatCompletionRequest {
  return {
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Solve the course question. Return JSON only with answer, reasoningSummary, and confidence.",
      },
      {
        role: "user",
        content: createUserContent(request),
      },
    ],
  }
}

function createUserContent(request: SolveRequest): string | readonly ChatContentPart[] {
  const questionText = createQuestionText(request)

  switch (request.kind) {
    case "text":
      return questionText
    case "image":
      return [{ type: "text", text: questionText }, ...request.images.map(toImagePart)]
    default:
      return assertNever(request)
  }
}

function createQuestionText(request: SolveRequest): string {
  const options = request.options ?? []
  const optionText =
    options.length === 0 ? "Options: none" : `Options:\n${options.map(formatOption).join("\n")}`

  return [
    `Question type: ${request.type}`,
    `Title: ${request.title}`,
    optionText,
    "Answer with the best option label/text when options are present.",
  ].join("\n")
}

function formatOption(option: string, index: number): string {
  return `${index + 1}. ${option}`
}

function toImagePart(image: ImageInput): ChatImagePart {
  switch (image.kind) {
    case "url":
      return {
        type: "image_url",
        image_url: { url: image.url.trim() },
      }
    case "base64":
      return {
        type: "image_url",
        image_url: {
          url: `data:${image.mimeType};base64,${image.imageBase64.replace(WHITESPACE, "")}`,
        },
      }
    default:
      return assertNever(image)
  }
}

function parseProviderAnswer(content: string): Result<ProviderAnswer, "invalid_answer"> {
  const json = parseJson(content)
  if (!json.ok) {
    return err("invalid_answer")
  }

  const parsed = ProviderAnswerPayloadSchema.safeParse(json.value)
  if (!parsed.success) {
    return err("invalid_answer")
  }

  return ok(parsed.data)
}

function parseJson(value: string): Result<unknown, "invalid_json"> {
  try {
    return ok(JSON.parse(value))
  } catch {
    return err("invalid_json")
  }
}

function toChatCompletionEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "")

  if (trimmed.endsWith("/chat/completions")) {
    return trimmed
  }

  return `${trimmed}/chat/completions`
}

function normalizeOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim()

  if (trimmed === undefined || trimmed.length === 0) {
    return undefined
  }

  return trimmed
}
