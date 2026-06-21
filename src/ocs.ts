const OCS_HANDLER =
  "return res.code === 1 ? [res.question, res.answer] : [res.msg || 'No answer', undefined]"
const PLACEHOLDER_PREFIX = "$"
const TITLE_PLACEHOLDER = `${PLACEHOLDER_PREFIX}{title}`
const TYPE_PLACEHOLDER = `${PLACEHOLDER_PREFIX}{type}`
const OPTIONS_PLACEHOLDER = `${PLACEHOLDER_PREFIX}{options}`

export type OcsAnswererConfig = {
  readonly name: "OCS LLM Solver"
  readonly homepage: string
  readonly url: string
  readonly method: "post"
  readonly contentType: "json"
  readonly data: {
    readonly title: string
    readonly type: string
    readonly options: string
  }
  readonly handler: typeof OCS_HANDLER
}

export function createOcsAnswererConfig(publicBaseUrl: string): readonly OcsAnswererConfig[] {
  const baseUrl = normalizeBaseUrl(publicBaseUrl)

  return [
    {
      name: "OCS LLM Solver",
      homepage: `${baseUrl}/health`,
      url: `${baseUrl}/api/ocs/answer`,
      method: "post",
      contentType: "json",
      data: {
        title: TITLE_PLACEHOLDER,
        type: TYPE_PLACEHOLDER,
        options: OPTIONS_PLACEHOLDER,
      },
      handler: OCS_HANDLER,
    },
  ]
}

function normalizeBaseUrl(publicBaseUrl: string): string {
  const trimmed = publicBaseUrl.trim().replace(/\/+$/, "")

  if (trimmed.length > 0) {
    return trimmed
  }

  return "http://127.0.0.1:3107"
}
