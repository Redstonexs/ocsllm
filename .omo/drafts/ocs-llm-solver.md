---
slug: ocs-llm-solver
status: awaiting-approval
intent: unclear
pending-action: write .omo/plans/ocs-llm-solver.md
approach: Greenfield TypeScript Hono service that exposes an OCS-compatible answerer endpoint, a direct text/image solve API, an optional browser bridge for image questions, and a provider-agnostic LLM solver with schema-validated answers.
---

# Draft: ocs-llm-solver

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| C1 | Strict TypeScript API scaffold, scripts, tests, and env configuration | active | README.md:1; subagent 019eeabc-96b5-7940-9f23-0a53df2909ca |
| C2 | OCS AnswererWrapper-compatible text question-bank adapter and config JSON endpoint | active | https://docs.ocsjs.com/docs/other/api lines 51-76, 80-104, 401-408 |
| C3 | Direct solve API for text-only and image-containing question payloads | active | Context7 Hono request/testing docs; Context7 Zod v4 discriminated union docs |
| C4 | LLM provider boundary with structured answer schema, retries, timeouts, and deterministic failures | active | Context7 Vercel AI SDK generateObject/image prompt docs |
| C5 | Image ingestion path with size/type validation and browser-side capture bridge because standard OCS placeholders do not document images | active | https://docs.ocsjs.com/docs/other/api lines 235-237, 401-408 |
| C6 | Answer cache/question-bank repository for repeated questions and fixture-driven regression evaluation | active | https://docs.ocsjs.com/ lines 36-41 |
| C7 | Agent-executed QA harness: unit, integration, and real HTTP/manual scenarios for text, image, cache, and provider failure | active | Context7 Hono testing docs |

## Open assumptions (announced defaults)
<!-- Intent is UNCLEAR: research resolves ambiguity, defaults are adopted (not asked), and each is surfaced in the plan's human TL;DR for veto. -->
<!-- assumption | adopted default | rationale | reversible? -->
| Work shape | Treat this as a greenfield product in F:\ocsllm, not an edit to an existing OCS checkout | The repo contains only README.md, so there is no existing stack to preserve | yes |
| Tier | HEAVY / Architecture | This adds a new service, external integration, LLM boundary, image handling, persistence/cache, and real QA surface | yes |
| Skill routing | Use ulw-plan as the controlling workflow; use brainstorming only for context exploration and design checks, not its separate docs/spec gate | The user explicitly invoked omo:ulw-plan, whose planner-only approval gate conflicts with brainstorming's implementation-prep doc workflow | yes |
| Stack | TypeScript, Bun-compatible tooling, Hono, Zod v4, Vercel AI SDK, and a small SQLite-backed cache/repository | This matches the repo's empty state, the programming skill defaults, Hono's testable API surface, Zod boundary parsing, and AI SDK structured output | yes |
| OCS integration | Do not fork or patch OCS initially; expose an OCS AnswererWrapper-compatible HTTP question-bank endpoint plus a generated config/subscription JSON | OCS docs define external question-bank configuration with url, method, data, contentType, headers, and handler | yes |
| Text OCS payload | Support documented OCS fields first: title, type, options | OCS docs list placeholders for title/type/options and examples around these fields | yes |
| Image support | Support images through a direct solve endpoint and optional browser bridge/userscript that sends image URL/base64/file data to the backend | Standard OCS AnswererWrapper docs only document title/type/options placeholders, not image transport | yes |
| LLM provider | Provider-agnostic AI SDK adapter with env-configured provider/model, no hardcoded vendor credentials | The user asked for LLM solving but did not choose a provider | yes |
| Output contract | Return OCS-compatible answer strings plus structured internal answer objects with answer, reasoning summary, confidence, source, and cache/provider status | OCS handler expects arrays like [question, answer], while internal QA needs richer evidence | yes |
| Guardrails | No credential harvesting, captcha/proctoring bypass, stealth/anti-detection behavior, or hardcoded paid/private question-bank API assumptions | These are unnecessary for the requested integration and would create avoidable legal/security risk | no |

## Findings (cited - path:lines)
- README.md:1 is the only tracked product file, so there is no existing implementation, test runner, package manager, or local API boundary to extend.
- `git status --short` was clean before `.omo/` planning artifacts were created; current product code remains untouched.
- The planning subagent independently verified the same empty-project facts: only README.md was found by `git ls-files`, `rg --files`, recursive listing, and CodeGraph.
- OCS public site describes automatic answering and online question search with question-bank cache and AI answering features: https://docs.ocsjs.com/ lines 36-41.
- OCS auto-answer docs say question-bank configuration is a JSON string or subscription link and controls how to search, process results, send requests, and show provider homepage information: https://docs.ocsjs.com/docs/work lines 41-50.
- OCS developer docs say only partial APIs are public and deeper secondary development requires contacting the author: https://docs.ocsjs.com/docs/other/api lines 32-35. The plan must not depend on undocumented private APIs.
- OCS AnswererWrapper config supports url, name, homepage, data, method get/post, contentType json/text, request type fetch/GM_xmlhttpRequest, headers, and handler: https://docs.ocsjs.com/docs/other/api lines 51-68.
- OCS handler must parse the response and return an array, two-dimensional array, or undefined, with examples of [question, answer] and multiple search results: https://docs.ocsjs.com/docs/other/api lines 70-104.
- OCS config examples show the runtime question context as title, type, and options, and special placeholders include ${title}, ${type}, and ${options}: https://docs.ocsjs.com/docs/other/api lines 182-199 and 401-408.
- OCS custom field parsing docs say data field parsing sees env values shaped as {title, options, type}; this is the evidence that image transport is not documented in the standard wrapper path: https://docs.ocsjs.com/docs/other/api lines 231-237.
- Hono current docs support JSON body parsing through `c.req.json()`, validator middleware for body/params/query, JSON responses through `c.json`, and app-level request testing with JSON and multipart FormData. Source: Context7 /websites/hono_dev.
- Zod v4 current docs support discriminated unions and nested discriminated unions, suitable for typed text-question vs image-question payloads and structured LLM result parsing. Source: Context7 /websites/zod_dev_v4.
- Vercel AI SDK current docs support `generateObject` with Zod schemas, structured object output, and image URL/file prompts for image-capable models. Source: Context7 /vercel/ai.

## Decisions (with rationale)
- Build an API-first service, not a UI-first app. The faithful surface for OCS is HTTP question-bank configuration and answer endpoints.
- Provide two public input surfaces: `/api/ocs/answer` for documented OCS text/config traffic and `/api/solve` for first-party text/image solving.
- Generate an OCS config/subscription JSON endpoint so users can paste/subscribe in OCS rather than hand-writing handler strings.
- Keep standard OCS text mode simple: send title/type/options to the backend, then let the backend return a response that the handler converts to `[question, answer]`.
- Implement image support outside the standard AnswererWrapper path unless a later repo/source read proves OCS exposes image fields. The browser bridge owns page-image capture and calls `/api/solve` with image data.
- Use Zod schemas for every inbound and outbound external boundary: OCS request, direct solve request, LLM structured result, cache record, and error payload.
- Use the LLM only after cache lookup misses, so repeated questions behave like a question bank and avoid repeated provider cost.
- Persist enough answer evidence for debugging and regression fixtures, but do not store raw secrets or browser session data.

## Scope IN
- Scaffold a strict TypeScript backend with reproducible scripts, tests, lint/typecheck, env parsing, and a health endpoint.
- Define domain schemas for text-only questions, image-containing questions, options, question types, answer records, and typed errors.
- Implement OCS-compatible question-bank endpoint and config/subscription JSON generation.
- Implement direct `/api/solve` endpoint accepting text JSON and image payloads by URL/base64/multipart, subject to explicit size and MIME limits.
- Implement provider-agnostic LLM solver using structured schema output and deterministic failure handling.
- Implement answer cache/repository with exact and normalized question keys.
- Implement optional browser bridge/userscript entry for image capture and API submission.
- Add fixture-based tests and real HTTP QA for text, image, cache hit, malformed payload, and provider failure.

## Scope OUT (Must NOT have)
- No direct mutation of OCS upstream code unless the user later changes scope to a fork/plugin.
- No reliance on private, paid, undocumented, or scraped OCS/Yanxi APIs.
- No browser credential capture, cookie exfiltration, captcha bypass, proctoring bypass, anti-detection, or stealth automation.
- No hardcoded LLM API keys, model names that cannot be changed, or provider-specific domain types leaking through the solver boundary.
- No claim that standard OCS AnswererWrapper supports images unless implementation evidence is found.
- No production UI dashboard in the first plan unless the user explicitly widens scope.

## Open questions
- None blocking. This is intentionally routed as UNCLEAR: defaults above are the plan's proposed answers. If any default is wrong, the user should veto it before plan writing.

## Approval gate
status: awaiting-approval
pending action: write and review .omo/plans/ocs-llm-solver.md with decision-complete todos, exact commands, and real-surface QA evidence paths.
approval received: user said "我明白了，开始执行计划".
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->

## Approval brief (zh-CN)
我把需求按开放式新项目处理：在空仓库里做一个 TypeScript/Hono 后端服务，给 OCS 提供可订阅/可粘贴的题库配置和答题接口，同时提供独立 `/api/solve` 接口处理纯文字题与带图题。标准 OCS AnswererWrapper 文档只明确了 `title`、`type`、`options`，没有找到图片字段，所以默认方案是：OCS 标准路径先覆盖文字题；带图题通过一个可选浏览器桥接脚本抓取图片 URL/base64 后发给后端。后端先查本地题库缓存，未命中再调用可配置 LLM，并用 Zod 校验结构化答案。

我采用的默认决策：不 fork OCS；不依赖未公开的 OCS 私有 API；LLM 使用 provider-agnostic 边界，密钥和模型走环境变量；所有入站/出站数据都做 schema 边界解析；不做验证码/监考/反检测/凭据抓取；第一版不做管理后台 UI。

用户已批准这些默认方向并要求开始执行计划。下一步按 `.omo/plans/ocs-llm-solver.md` 进入 start-work 执行。
