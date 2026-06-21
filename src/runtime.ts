import { InMemoryAnswerCache } from "./cache"
import { OpenAiCompatibleAnswerProvider } from "./openai-compatible-provider"
import { err, type Result } from "./result"
import {
  type AnswerProvider,
  createCacheBackedSolver,
  FakeAnswerProvider,
  type ProviderAnswer,
  type ProviderFailure,
  type SolveRequest,
} from "./solver"

const DEFAULT_PUBLIC_BASE_URL = "http://127.0.0.1:3107"

export type RuntimeEnv = {
  readonly [key: string]: string | undefined
  readonly OCS_PUBLIC_BASE_URL?: string
  readonly PUBLIC_BASE_URL?: string
  readonly OCS_LLM_PROVIDER?: string
  readonly LLM_PROVIDER?: string
  readonly OCS_FAKE_ANSWER?: string
  readonly FAKE_ANSWER?: string
  readonly OCS_LLM_BASE_URL?: string
  readonly LLM_BASE_URL?: string
  readonly OCS_LLM_MODEL?: string
  readonly LLM_MODEL?: string
  readonly OCS_LLM_PROVIDER_NAME?: string
  readonly LLM_PROVIDER_NAME?: string
  readonly OCS_LLM_API_KEY?: string
  readonly LLM_API_KEY?: string
  readonly OPENAI_API_KEY?: string
}

export function getPublicBaseUrl(env: RuntimeEnv = Bun.env): string {
  return firstFilled(env.OCS_PUBLIC_BASE_URL, env.PUBLIC_BASE_URL) ?? DEFAULT_PUBLIC_BASE_URL
}

export function createDefaultSolver(env: RuntimeEnv = Bun.env) {
  return createCacheBackedSolver({
    cache: new InMemoryAnswerCache(),
    provider: createAnswerProviderFromEnv(env),
  })
}

export function createAnswerProviderFromEnv(env: RuntimeEnv = Bun.env): AnswerProvider {
  const provider = (firstFilled(env.OCS_LLM_PROVIDER, env.LLM_PROVIDER) ?? "fake").toLowerCase()

  switch (provider) {
    case "fake":
      return new FakeAnswerProvider({
        answer: {
          answer: firstFilled(env.OCS_FAKE_ANSWER, env.FAKE_ANSWER) ?? "B",
          reasoningSummary: "Fake runtime provider selected the configured answer.",
          confidence: 1,
        },
      })
    case "openai-compatible":
      return createOpenAiCompatibleProvider(env)
    default:
      return new ConfigurationFailureProvider(provider, "Unsupported OCS_LLM_PROVIDER value.")
  }
}

function createOpenAiCompatibleProvider(env: RuntimeEnv): AnswerProvider {
  const baseUrl = firstFilled(env.OCS_LLM_BASE_URL, env.LLM_BASE_URL)
  const model = firstFilled(env.OCS_LLM_MODEL, env.LLM_MODEL)

  if (baseUrl === undefined || model === undefined) {
    return new ConfigurationFailureProvider(
      "openai-compatible",
      "OCS_LLM_BASE_URL and OCS_LLM_MODEL are required.",
    )
  }

  const providerName = firstFilled(env.OCS_LLM_PROVIDER_NAME, env.LLM_PROVIDER_NAME)
  const apiKey = firstFilled(env.OCS_LLM_API_KEY, env.LLM_API_KEY, env.OPENAI_API_KEY)

  return new OpenAiCompatibleAnswerProvider({
    baseUrl,
    model,
    ...(providerName === undefined ? {} : { providerName }),
    ...(apiKey === undefined ? {} : { apiKey }),
  })
}

function firstFilled(...values: readonly (string | undefined)[]): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed !== undefined && trimmed.length > 0) {
      return trimmed
    }
  }

  return undefined
}

class ConfigurationFailureProvider implements AnswerProvider {
  readonly name: string
  private readonly message: string

  constructor(name: string, message: string) {
    this.name = name
    this.message = message
  }

  async solve(_request: SolveRequest): Promise<Result<ProviderAnswer, ProviderFailure>> {
    return err({
      kind: "provider_failure",
      providerName: this.name,
      message: this.message,
      cacheStatus: "miss",
    })
  }
}
