import { type Context, Hono } from "hono"
import { cors } from "hono/cors"

import { createOcsAnswererConfig } from "./ocs"
import { err, ok, type Result } from "./result"
import { createDefaultSolver, getPublicBaseUrl } from "./runtime"
import {
  OcsTextRequestSchema,
  type PublicErrorPayload,
  PublicErrorPayloadSchema,
  type SolveRequest,
  SolveRequestSchema,
  type StructuredAnswer,
  StructuredAnswerSchema,
} from "./schemas"
import type { SolveResult, SolveSuccess } from "./solver"

const HEALTH_RESPONSE = { status: "ok" } as const
const SOLVER_FAILURE_MESSAGE = "Solver failed to produce an answer."

type SolverPort = {
  solve(request: SolveRequest): Promise<SolveResult>
}

type AppConfig = {
  readonly publicBaseUrl?: string
  readonly solver?: SolverPort
}

type PublicErrorCode = PublicErrorPayload["error"]["code"]
type PublicErrorIssue = NonNullable<PublicErrorPayload["error"]["issues"]>[number]
type ValidationIssue = {
  readonly path: readonly PropertyKey[]
  readonly message: string
}

export function createApp(config: AppConfig = {}): Hono {
  const app = new Hono()
  const solver = config.solver ?? createDefaultSolver()
  const publicBaseUrl = config.publicBaseUrl ?? getPublicBaseUrl()

  app.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: ["content-type"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }),
  )

  app.get("/health", (context) => context.json(HEALTH_RESPONSE))

  app.get("/api/ocs/config", (context) => context.json(createOcsAnswererConfig(publicBaseUrl)))

  app.post("/api/ocs/answer", async (context) => {
    const body = await readJsonBody(context)
    if (!body.ok) {
      return context.json(body.error, 400)
    }

    const parsed = OcsTextRequestSchema.safeParse(body.value)
    if (!parsed.success) {
      return context.json(createValidationError(parsed.error.issues), 400)
    }

    const result = await solver.solve({
      kind: "text",
      title: parsed.data.title,
      type: parsed.data.type,
      options: parsed.data.options,
    })

    if (!result.ok) {
      return context.json({ code: 0, msg: SOLVER_FAILURE_MESSAGE } as const)
    }

    const answer = toStructuredAnswer(result.value)
    return context.json({
      code: 1,
      question: parsed.data.title,
      answer: answer.answer,
      data: answer,
    } as const)
  })

  app.post("/api/solve", async (context) => {
    const body = await readJsonBody(context)
    if (!body.ok) {
      return context.json(body.error, 400)
    }

    const parsed = SolveRequestSchema.safeParse(body.value)
    if (!parsed.success) {
      return context.json(createValidationError(parsed.error.issues), 400)
    }

    const result = await solver.solve(parsed.data)
    if (!result.ok) {
      return context.json(createPublicError("solver_error", SOLVER_FAILURE_MESSAGE), 502)
    }

    return context.json(toStructuredAnswer(result.value))
  })

  app.notFound((context) => context.json(createPublicError("not_found", "Route not found."), 404))

  app.onError((_error, context) =>
    context.json(createPublicError("internal_error", "Unexpected internal error."), 500),
  )

  return app
}

async function readJsonBody(context: Context): Promise<Result<unknown, PublicErrorPayload>> {
  try {
    return ok(await context.req.json())
  } catch {
    return err(createPublicError("validation_error", "Request body must be valid JSON."))
  }
}

function createValidationError(issues: readonly ValidationIssue[]): PublicErrorPayload {
  return createPublicError(
    "validation_error",
    "Invalid request payload.",
    issues.map((issue) => ({
      path: issue.path.map(toPublicPathPart),
      message: issue.message,
    })),
  )
}

function toPublicPathPart(part: PropertyKey): string | number {
  if (typeof part === "number" && Number.isInteger(part) && part >= 0) {
    return part
  }

  return String(part)
}

function createPublicError(
  code: PublicErrorCode,
  message: string,
  issues?: readonly PublicErrorIssue[],
): PublicErrorPayload {
  if (issues === undefined || issues.length === 0) {
    return PublicErrorPayloadSchema.parse({ error: { code, message } })
  }

  return PublicErrorPayloadSchema.parse({ error: { code, message, issues } })
}

function toStructuredAnswer(answer: SolveSuccess): StructuredAnswer {
  return StructuredAnswerSchema.parse({
    answer: answer.answer,
    reasoningSummary: answer.reasoningSummary,
    confidence: answer.confidence,
    source: answer.source,
    cacheStatus: answer.cacheStatus,
    providerStatus: answer.providerStatus,
    inputKind: answer.inputKind,
  })
}

export const app = createApp()
