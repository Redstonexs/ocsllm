import type { AnswerCache } from "./cache"
import { err, ok, type Result } from "./result"
import type { ImageInput, SolveRequest } from "./schemas"

export type { ImageInput, SolveRequest } from "./schemas"

const CACHE_KEY_VERSION = "solver-cache-v1"
const WHITESPACE = /\s+/g

export type ProviderAnswer = {
  readonly answer: string
  readonly reasoningSummary: string
  readonly confidence: number
}

export type CachedSolverAnswer = ProviderAnswer & {
  readonly inputKind: SolveRequest["kind"]
}

export type ProviderFailure = {
  readonly kind: "provider_failure"
  readonly providerName: string
  readonly message: string
  readonly cacheStatus: "miss"
}

export type SolveSuccess = CachedSolverAnswer & {
  readonly source: "cache" | "llm"
  readonly cacheStatus: "hit" | "miss"
  readonly providerStatus: "success" | "skipped"
}

export type SolveResult = Result<SolveSuccess, ProviderFailure>

export interface AnswerProvider {
  readonly name: string
  solve(request: SolveRequest): Promise<Result<ProviderAnswer, ProviderFailure>>
}

export type CacheBackedSolverConfig = {
  readonly cache: AnswerCache
  readonly provider: AnswerProvider
}

export class CacheBackedSolver {
  private readonly cache: AnswerCache
  private readonly provider: AnswerProvider

  constructor(config: CacheBackedSolverConfig) {
    this.cache = config.cache
    this.provider = config.provider
  }

  async solve(request: SolveRequest): Promise<SolveResult> {
    const cacheKey = createSolverCacheKey(request)
    const cached = this.cache.get(cacheKey)

    if (cached !== undefined) {
      return ok({
        ...cached,
        source: "cache",
        cacheStatus: "hit",
        providerStatus: "skipped",
      })
    }

    const providerResult = await this.callProvider(request)

    switch (providerResult.ok) {
      case true: {
        const cacheValue = {
          ...providerResult.value,
          inputKind: request.kind,
        } satisfies CachedSolverAnswer
        this.cache.set(cacheKey, cacheValue)
        return ok({
          ...cacheValue,
          source: "llm",
          cacheStatus: "miss",
          providerStatus: "success",
        })
      }
      case false:
        return err(providerResult.error)
      default:
        return assertNever(providerResult)
    }
  }

  private async callProvider(
    request: SolveRequest,
  ): Promise<Result<ProviderAnswer, ProviderFailure>> {
    try {
      return await this.provider.solve(request)
    } catch (error) {
      if (error instanceof Error) {
        return err(createProviderFailure(this.provider.name))
      }

      return err(createNonErrorProviderFailure(this.provider.name))
    }
  }
}

export type FakeAnswerProviderConfig = {
  readonly answer?: ProviderAnswer
  readonly failure?: ProviderFailure
}

export class FakeAnswerProvider implements AnswerProvider {
  readonly name = "fake"
  private readonly recordedCalls: SolveRequest[] = []
  private readonly answer: ProviderAnswer
  private readonly failure: ProviderFailure | undefined

  constructor(config: FakeAnswerProviderConfig = {}) {
    this.answer =
      config.answer ??
      ({
        answer: "B",
        reasoningSummary: "Fake solver selected the configured answer.",
        confidence: 1,
      } as const)
    this.failure = config.failure
  }

  get calls(): readonly SolveRequest[] {
    return this.recordedCalls
  }

  async solve(request: SolveRequest): Promise<Result<ProviderAnswer, ProviderFailure>> {
    this.recordedCalls.push(request)

    if (this.failure !== undefined) {
      return err(this.failure)
    }

    return ok(this.answer)
  }
}

export function createCacheBackedSolver(config: CacheBackedSolverConfig): CacheBackedSolver {
  return new CacheBackedSolver(config)
}

export function createSolverCacheKey(request: SolveRequest): string {
  switch (request.kind) {
    case "text":
      return stableKey([
        CACHE_KEY_VERSION,
        request.kind,
        normalizeText(request.type),
        normalizeText(request.title),
        ...normalizeOptions(request.options ?? []),
      ])
    case "image":
      return stableKey([
        CACHE_KEY_VERSION,
        request.kind,
        normalizeText(request.type),
        normalizeText(request.title),
        ...normalizeOptions(request.options ?? []),
        ...request.images.map(normalizeImage),
      ])
    default:
      return assertNever(request)
  }
}

function normalizeOptions(options: readonly string[]): readonly string[] {
  return options.map(normalizeText)
}

function normalizeImage(image: ImageInput): string {
  switch (image.kind) {
    case "url":
      return stableKey([image.kind, image.url.trim()])
    case "base64":
      return stableKey([
        image.kind,
        image.mimeType.trim().toLowerCase(),
        image.imageBase64.replace(WHITESPACE, ""),
      ])
    default:
      return assertNever(image)
  }
}

function normalizeText(value: string): string {
  return value.trim().replace(WHITESPACE, " ").toLowerCase()
}

function stableKey(parts: readonly string[]): string {
  return JSON.stringify(parts)
}

export function createProviderFailure(providerName: string): ProviderFailure {
  return {
    kind: "provider_failure",
    providerName,
    message: "provider execution failed",
    cacheStatus: "miss",
  }
}

export function createNonErrorProviderFailure(providerName: string): ProviderFailure {
  return {
    kind: "provider_failure",
    providerName,
    message: "provider failed with a non-error value",
    cacheStatus: "miss",
  }
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected solver variant: ${JSON.stringify(value)}`)
}
