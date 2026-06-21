# ocs-llm-solver

用于 OCS 文本题库集成以及文本/图片题直接 LLM 求解的本地 Bun/Hono 服务。

## 暴露的接口

- `GET /health`
- `GET /api/ocs/config`
- `POST /api/ocs/answer`
- `POST /api/solve`

OCS 标准答题器配置只包含 `title`、`type` 和 `options`，因此图片题使用了 `scripts/ocs-bridge.user.js` 中附带的浏览器桥接脚本。该桥接脚本会收集可见题目文本、选项和图片，然后调用 `/api/solve`。
本地服务已启用 CORS，因此浏览器页面可以从 OCS/课程来源调用它。

## 安装与运行

```sh
bun install
bun run src/index.ts
```

默认本地行为使用伪造提供方，并返回答案 `B`，这样无需 API key 也能稳定进行路由 QA。

打开这个 OCS 配置地址：

```txt
http://127.0.0.1:3107/api/ocs/config
```

## LLM 提供方

如需接入真实 LLM，请配置一个兼容 OpenAI 的 chat-completions 端点：

```sh
OCS_LLM_PROVIDER=openai-compatible
OCS_LLM_BASE_URL=https://your-provider.example/v1
OCS_LLM_MODEL=your-model
OCS_LLM_API_KEY=your-key
bun run src/index.ts
```

对于不需要 bearer token 的本地提供方，可以省略 `OCS_LLM_API_KEY`。
不会硬编码任何模型或密钥。

## 直接求解示例

文本题：

```sh
curl -i -X POST http://127.0.0.1:3107/api/solve \
  -H "content-type: application/json" \
  --data '{"kind":"text","title":"1+1=?","type":"single","options":["A.1","B.2"]}'
```

图片 URL：

```sh
curl -i -X POST http://127.0.0.1:3107/api/solve \
  -H "content-type: application/json" \
  --data '{"kind":"image","title":"Read the chart","type":"single","options":["A.2","B.4"],"images":[{"kind":"url","url":"https://example.com/q.png"}]}'
```

Base64 图片格式：

```json
{"kind":"base64","mimeType":"image/png","imageBase64":"..."}
```

支持的 MIME 类型为 PNG、JPEG、WebP 和 GIF。解码后的 base64 图片数据每张限制为 5 MiB。

## 浏览器桥接

在用户脚本管理器中安装或粘贴 `scripts/ocs-bridge.user.js`，然后调整：

- `apiBase`
- `selectors.title`
- `selectors.option`
- `selectors.image`
- `questionType`

该桥接脚本只会在页面面板中显示返回的答案。它不会修改 OCS 源码，不依赖私有 OCS API，也不会执行页面上的答题操作。

## 验证

```sh
bun test
bunx tsc --noEmit
bunx biome check .
git diff --check
```
