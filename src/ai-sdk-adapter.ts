import { err, ok, type Result } from "./result"
import {
  type AnswerProvider,
  assertNever,
  createNonErrorProviderFailure,
  createProviderFailure,
  type ImageInput,
  type ProviderAnswer,
  type ProviderFailure,
  type SolveRequest,
} from "./solver"

export type AiSdkTextPart = {
  readonly type: "text"
  readonly text: string
}

export type AiSdkFilePart = {
  readonly type: "file"
  readonly mediaType: string
  readonly data: string | URL
}

export type AiSdkMessage = {
  readonly role: "user"
  readonly content: readonly (AiSdkTextPart | AiSdkFilePart)[]
}

export type AiSdkGenerateObjectRequest = {
  readonly modelId: string
  readonly schemaName: "solver-answer"
  readonly messages: readonly AiSdkMessage[]
}

export type AiSdkGenerateObjectResult = {
  readonly object: ProviderAnswer
}

export interface AiSdkGenerateObjectPort {
  generateObject(request: AiSdkGenerateObjectRequest): Promise<AiSdkGenerateObjectResult>
}

export type AiSdkAnswerProviderConfig = {
  readonly providerName: string
  readonly modelId: string
  readonly generator: AiSdkGenerateObjectPort
}

export class AiSdkAnswerProvider implements AnswerProvider {
  readonly name: string
  private readonly modelId: string
  private readonly generator: AiSdkGenerateObjectPort

  constructor(config: AiSdkAnswerProviderConfig) {
    this.name = config.providerName
    this.modelId = config.modelId
    this.generator = config.generator
  }

  async solve(request: SolveRequest): Promise<Result<ProviderAnswer, ProviderFailure>> {
    try {
      const result = await this.generator.generateObject({
        modelId: this.modelId,
        schemaName: "solver-answer",
        messages: buildAiSdkMessages(request),
      })
      return ok(result.object)
    } catch (error) {
      if (error instanceof Error) {
        return err(createProviderFailure(this.name))
      }

      return err(createNonErrorProviderFailure(this.name))
    }
  }
}

function buildAiSdkMessages(request: SolveRequest): readonly AiSdkMessage[] {
  const options = request.options ?? []
  const text = [
    `Question type: ${request.type}`,
    `Title: ${request.title}`,
    `Options: ${options.join(" | ")}`,
  ].join("\n")

  switch (request.kind) {
    case "text":
      return [{ role: "user", content: [{ type: "text", text }] }]
    case "image":
      return [
        {
          role: "user",
          content: [{ type: "text", text }, ...request.images.map(toAiSdkFilePart)],
        },
      ]
    default:
      return assertNever(request)
  }
}

function toAiSdkFilePart(image: ImageInput): AiSdkFilePart {
  switch (image.kind) {
    case "url":
      return { type: "file", mediaType: "image", data: image.url.trim() }
    case "base64":
      return {
        type: "file",
        mediaType: image.mimeType.trim().toLowerCase(),
        data: image.imageBase64,
      }
    default:
      return assertNever(image)
  }
}
