# ocs-llm-solver - Work Plan

## TL;DR (For humans)
**What you'll get:** 一个本地/可部署的 OCS LLM 题库服务：OCS 可以把纯文字题通过题库配置发给它；图片题可以通过附带的浏览器桥接脚本把题干、选项和图片一起交给同一个解题接口。服务会先查本地题库缓存，未命中再调用可配置 LLM，并返回 OCS 可识别的答案。

**Why this approach:** OCS 的公开 AnswererWrapper 文档明确支持 `title/type/options`，但没有公开图片字段，所以文字题走标准题库接口，图片题走桥接脚本调用后端的直连解题接口。这样不 fork OCS，也不依赖未公开 API。

**What it will NOT do:** 不抓取账号凭据、不绕过验证码/监考/反检测；不硬编码某个付费题库或 LLM 密钥；不承诺 OCS 标准题库接口原生支持图片。

**Effort:** Medium
**Risk:** Medium - 主要风险是不同网课页面的图片 DOM 结构不一致，桥接脚本需要保守选择器和可配置 selector。
**Decisions I made for you:** TypeScript/Bun/Hono/Zod；Vercel AI SDK 的 provider 边界；内置内存缓存，后续可替换持久化；OCS 标准接口只处理文字字段，图片由桥接脚本补足。

Your next move: 已批准开始执行。Full execution detail follows below.

---

> TL;DR (machine): Medium-risk greenfield TypeScript Hono service with OCS text answer endpoint, direct text/image solve endpoint, LLM adapter, cache, browser bridge, tests, and HTTP QA.

## Scope
### Must have
- Strict TypeScript/Bun project scaffold with Hono API, Zod schemas, Biome, typecheck, and tests.
- `GET /health` returns service status.
- `GET /api/ocs/config` returns an OCS AnswererWrapper-compatible JSON configuration for text questions.
- `POST /api/ocs/answer` accepts OCS-style `title`, `type`, and `options`, solves through cache/LLM, and returns a handler-friendly JSON body.
- `POST /api/solve` accepts a discriminated union payload for pure text questions and image-containing questions.
- Image payloads support `imageUrl` and `imageBase64` with MIME/size validation; multipart can be deferred only if JSON image paths are fully working and documented.
- LLM boundary is provider-agnostic and testable with a fake solver; real provider configuration is environment-based.
- Answers return both OCS-compatible answer strings and structured internal metadata: answer, reasoning summary, confidence, source, cache status, and provider status.
- Browser bridge user script is included under `public/` or `scripts/` and demonstrates how to collect text/options/images and call `/api/solve`.
- Tests cover text solve, image solve, OCS config shape, OCS answer shape, cache hit, malformed input, and provider failure.
- Real HTTP QA runs against a live local server with `curl -i` and captures evidence under `.omo/evidence/`.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- No direct edits to upstream OCS code.
- No dependence on private OCS/Yanxi APIs.
- No credential capture, cookie exfiltration, captcha/proctoring bypass, stealth behavior, or anti-detection logic.
- No hardcoded API keys or non-configurable vendor-specific model assumptions.
- No `any`, `@ts-ignore`, `@ts-expect-error`, non-null assertions, or type assertions except `as const`.
- No product source file over 250 pure LOC.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD with `bun test`; integration-style Hono route tests use `app.request`.
- Static gates: `bunx biome check .`, `bunx tsc --noEmit`, `bun test`, and pure LOC check for every TS/JS file.
- Manual QA channel: HTTP calls against the live local service with `curl -i`.
- Evidence paths:
  - `.omo/evidence/task-1-ocs-llm-solver.txt`
  - `.omo/evidence/task-2-ocs-llm-solver.txt`
  - `.omo/evidence/task-3-ocs-llm-solver.txt`
  - `.omo/evidence/task-4-ocs-llm-solver.txt`
  - `.omo/evidence/task-5-ocs-llm-solver.txt`
  - `.omo/evidence/task-6-ocs-llm-solver.txt`
  - `.omo/evidence/final-ocs-llm-solver.txt`

## Execution strategy
### Parallel execution waves
- Wave 1: Todo 1 only. Establish reproducible tooling, app shell, and failing-first baseline tests.
- Wave 2: Todo 2 and Todo 3 can run after scaffold, but same-file conflicts should serialize if one worker owns product files.
- Wave 3: Todo 4 and Todo 5 can run after schemas/cache/solver seams exist.
- Wave 4: Todo 6 and final verification.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2, 3, 4, 5, 6 | none |
| 2 | 1 | 4, 5 | 3 if write sets are split |
| 3 | 1 | 4, 5 | 2 if write sets are split |
| 4 | 2, 3 | 6 | 5 after route seams exist |
| 5 | 2, 3 | 6 | 4 after route seams exist |
| 6 | 4, 5 | final verification | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Scaffold strict Hono/Bun service with health route
  What to do / Must NOT do: Create `package.json`, `tsconfig.json`, `biome.json`, `.gitignore`, `src/app.ts`, `src/index.ts`, and baseline route tests. Use Bun, Hono, Zod, Biome, TypeScript. Do not add broad framework abstractions or UI.
  Parallelization: Wave 1 | Blocked by: none | Blocks: all implementation todos
  References: README.md:1; `.omo/drafts/ocs-llm-solver.md`; Context7 Hono docs for `c.json` and `app.request`; TypeScript programming references.
  Acceptance criteria (agent-executable): `bun install`; create a failing test for `GET /health`, confirm RED, implement route, then `bun test` GREEN; `bunx tsc --noEmit` GREEN.
  QA scenarios (exact tool + invocation):
  - Happy HTTP: start `bun run src/index.ts` on port 3107, run `curl -i http://127.0.0.1:3107/health`; PASS iff status is `HTTP/1.1 200` or `HTTP/2 200` and body has `"status":"ok"`. Evidence `.omo/evidence/task-1-ocs-llm-solver.txt`.
  - Failure HTTP: `curl -i http://127.0.0.1:3107/not-found`; PASS iff status is 404. Evidence same file.
  Commit: N | feat(scaffold): create strict Hono Bun service

- [ ] 2. Define question, answer, error, and OCS schemas
  What to do / Must NOT do: Add Zod schemas and inferred readonly domain types for OCS text requests, direct text/image solve requests, image inputs, structured answers, and public errors. Use discriminated unions for `kind: "text" | "image"`. Do not pass raw `unknown` past boundary functions.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 4, 5
  References: OCS docs lines for `title/type/options`; Context7 Zod v4 discriminated union docs; TypeScript data-modeling and error-handling references.
  Acceptance criteria (agent-executable): write failing tests for valid text payload, valid image URL/base64 payload, missing title, unsupported MIME, and oversized image; implement schemas until `bun test` GREEN.
  QA scenarios (exact tool + invocation):
  - Happy HTTP: `curl -i -X POST http://127.0.0.1:3107/api/solve -H "content-type: application/json" --data '{"kind":"text","title":"1+1=?","type":"single","options":["A.1","B.2"]}'`; PASS iff 200 after route implementation and parsed response has `answer`.
  - Failure HTTP: same endpoint with `{"kind":"image","title":"","images":[]}`; PASS iff 400 with machine-readable validation error. Evidence `.omo/evidence/task-2-ocs-llm-solver.txt`.
  Commit: N | feat(domain): add typed question and answer schemas

- [ ] 3. Add cache-backed solver orchestration with fake and AI SDK adapters
  What to do / Must NOT do: Add an answer repository/cache seam, normalization/keying, fake solver for tests, and an AI SDK adapter behind an interface. Real LLM config must come from env. Do not require real network/API keys for tests or QA.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 4, 5
  References: Context7 Vercel AI SDK docs for `generateObject` and image prompts; TypeScript error handling reference; `.omo/drafts/ocs-llm-solver.md` decisions.
  Acceptance criteria (agent-executable): failing-first tests for cache miss calls fake LLM once, cache hit avoids fake LLM, provider failure returns typed failure, image request passes image content to solver seam; `bun test` GREEN.
  QA scenarios (exact tool + invocation):
  - Happy HTTP: with fake/test provider env enabled, call `/api/solve` twice with the same text payload; PASS iff second response reports `cacheStatus:"hit"`. Evidence `.omo/evidence/task-3-ocs-llm-solver.txt`.
  - Failure HTTP: run with fake provider configured to fail and call `/api/solve`; PASS iff 502 or typed solver failure response without stack trace or secrets. Evidence same file.
  Commit: N | feat(solver): add cache-backed LLM solver boundary

- [ ] 4. Implement OCS config and OCS answer endpoint
  What to do / Must NOT do: Add `GET /api/ocs/config` and `POST /api/ocs/answer`; response must be compatible with OCS handler expectations. Generated config must include url, name, homepage, method, contentType, data using `${title}`, `${type}`, `${options}`, and handler returning `[question, answer]` or `[msg, undefined]`.
  Parallelization: Wave 3 | Blocked by: 2, 3 | Blocks: 6
  References: OCS docs `AnswererWrapper` config and handler sections; OCS special placeholders; `.omo/drafts/ocs-llm-solver.md`.
  Acceptance criteria (agent-executable): tests assert config is an array with required fields and handler string, OCS answer returns `code:1` plus `question`/`answer`, no-answer/provider-failure returns `code:0` with `msg`.
  QA scenarios (exact tool + invocation):
  - Happy HTTP: `curl -i http://127.0.0.1:3107/api/ocs/config`; PASS iff status 200 and JSON array contains `name`, `url`, `data.title:"${title}"`, and `handler`.
  - Happy HTTP answer: `curl -i -X POST http://127.0.0.1:3107/api/ocs/answer -H "content-type: application/json" --data '{"title":"1+1=?","type":"single","options":"A.1\nB.2"}'`; PASS iff status 200, `code:1`, and answer is present.
  - Failure HTTP: malformed payload without title; PASS iff 400. Evidence `.omo/evidence/task-4-ocs-llm-solver.txt`.
  Commit: N | feat(ocs): expose OCS question-bank endpoints

- [ ] 5. Implement direct image/text solve API and browser bridge script
  What to do / Must NOT do: Finish `/api/solve` for text and image JSON payloads and add a browser userscript that can collect configurable question/option/image selectors, convert same-origin images through canvas when possible, preserve remote image URLs when not possible, and call `/api/solve`. Do not include stealth, credential capture, or automatic submission/clicking behavior.
  Parallelization: Wave 3 | Blocked by: 2, 3 | Blocks: 6
  References: OCS image limitation finding in `.omo/drafts/ocs-llm-solver.md`; Context7 AI SDK image prompt docs; guardrails in this plan.
  Acceptance criteria (agent-executable): tests cover text and image JSON requests; userscript contains configurable selectors, explicit API base, no credential/cookie reads, no answer auto-submit; `bun test` GREEN.
  QA scenarios (exact tool + invocation):
  - Happy HTTP image: `curl -i -X POST http://127.0.0.1:3107/api/solve -H "content-type: application/json" --data '{"kind":"image","title":"图中公式结果是什么？","type":"single","options":["A.2","B.4"],"images":[{"kind":"url","url":"https://example.com/q.png"}]}'`; PASS iff 200 and response includes `answer` plus `inputKind:"image"`.
  - Failure HTTP image: send `imageBase64` with unsupported MIME `image/svg+xml`; PASS iff 400. Evidence `.omo/evidence/task-5-ocs-llm-solver.txt`.
  - Auxiliary surface: inspect userscript with `rg -n "cookie|password|submit|click\\(" public scripts src`; PASS iff no credential capture or auto-submit path exists. Evidence same file.
  Commit: N | feat(bridge): add image-question browser bridge

- [ ] 6. Document setup and complete full verification wave
  What to do / Must NOT do: Update README with install, env, run, OCS config URL, direct solve examples, bridge-script usage, and limitations. Run all static/test/manual QA and record evidence. Do not claim real LLM provider was tested unless a real key was provided.
  Parallelization: Wave 4 | Blocked by: 4, 5 | Blocks: final verification
  References: README.md:1; all product files created by prior todos; `.omo/start-work/ledger.jsonl`.
  Acceptance criteria (agent-executable): `bunx biome check .`, `bunx tsc --noEmit`, `bun test`, `git diff --check`, pure LOC check, and live HTTP QA all pass or identify environment-only failures precisely.
  QA scenarios (exact tool + invocation):
  - Happy end-to-end text: live server plus `curl -i -X POST /api/ocs/answer` with text payload; PASS iff 200 and answer returned.
  - Happy end-to-end image: live server plus `curl -i -X POST /api/solve` image URL payload; PASS iff 200 and `inputKind:"image"`.
  - Failure end-to-end: invalid JSON/body; PASS iff 400 and no stack trace. Evidence `.omo/evidence/task-6-ocs-llm-solver.txt`.
  Commit: N | docs(readme): document OCS LLM solver usage

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy
- Do not commit unless the user explicitly asks.
- If committing later, use one conventional commit: `feat(ocs): add LLM-backed OCS solver`.
- Keep `.omo/` planning/evidence separate from product code if the user wants a product-only commit.

## Success criteria
- OCS text question-bank flow works through generated config and `/api/ocs/answer`.
- Direct `/api/solve` handles pure text and image-containing questions with schema validation.
- LLM solving is provider-configurable, testable without real keys, and does not leak secrets in errors.
- Cache/question-bank behavior avoids repeated LLM calls for identical normalized questions.
- Browser bridge script explains and demonstrates image capture without credential capture or auto-submit.
- Static checks, tests, and live HTTP QA pass with evidence artifacts.
