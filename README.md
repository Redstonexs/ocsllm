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

## 下载 Prerelease 直接运行

仓库内置了 GitHub Actions workflow：`.github/workflows/prerelease.yml`。推送到 `main`/`master` 或手动运行该 workflow 后，会自动创建/覆盖名为 `prerelease` 的 GitHub 预发布版本，并上传这些下载包：

- `ocs-llm-solver-linux-x64.tar.gz`
- `ocs-llm-solver-linux-arm64.tar.gz`
- `ocs-llm-solver-darwin-x64.tar.gz`
- `ocs-llm-solver-darwin-arm64.tar.gz`
- `ocs-llm-solver-windows-x64.zip`

每个包都包含独立可执行文件、`config.example.env`、启动脚本、README 和 `scripts/ocs-bridge.user.js`。下载对应平台的包后：

1. 解压压缩包。
2. 复制 `config.example.env` 为 `config.env`。
3. 按需修改 `config.env`，特别是 `OCS_PUBLIC_BASE_URL` 和 LLM 配置。
4. Linux/macOS 运行 `./run.sh`；Windows 运行 `run.cmd`。

`config.example.env` 默认使用 `OCS_LLM_PROVIDER=fake`，无需 API key 就能启动并返回测试答案 `B`。接真实 LLM 时，把 `OCS_LLM_PROVIDER` 改为 `openai-compatible`，并填写 `OCS_LLM_BASE_URL`、`OCS_LLM_MODEL`、`OCS_LLM_API_KEY`。

打开这个 OCS 配置地址：

```txt
http://127.0.0.1:3107/api/ocs/config
```

## OCS 用户接入方式

文字题走 OCS 标准题库接口：

1. 先启动本服务，并确认 `/health` 返回正常。
2. 如果使用 GitHub prerelease 包，先复制并编辑 `config.env`，再运行 `run.sh` 或 `run.cmd`。
3. 如果 OCS 页面和本服务不在同一台机器上，不要使用 `127.0.0.1`，需要把服务部署到公网域名，并设置 `OCS_PUBLIC_BASE_URL` 为该域名。
4. 打开 OCS 的题库配置/自定义题库配置入口，添加订阅链接：

```txt
http://127.0.0.1:3107/api/ocs/config
```

如果已经部署到公网，例如 EdgeOne 域名，则使用：

```txt
https://ocs-llm.example.com/api/ocs/config
```

5. 保存后，OCS 会把文字题的 `title`、`type`、`options` 发送到 `/api/ocs/answer`，本服务会先查本地缓存，未命中再调用 LLM，最后返回 OCS 可识别的答案。

带图题走浏览器桥接脚本：

1. 在 Tampermonkey、Violentmonkey 等用户脚本管理器中安装或粘贴 `scripts/ocs-bridge.user.js`。
2. 把脚本里的 `apiBase` 改成本服务地址，例如：

```js
apiBase: "http://127.0.0.1:3107"
```

公网部署后改为：

```js
apiBase: "https://ocs-llm.example.com"
```

3. 如果页面 DOM 不同，调整 `selectors.title`、`selectors.option`、`selectors.image` 和 `questionType`。
4. 在题目页面点击脚本面板里的 `Solve`，脚本会收集题干、选项和图片，调用 `/api/solve`，并只在面板里显示返回答案。

注意：OCS 标准题库配置只传文字字段，不包含图片字段，所以图片题必须使用桥接脚本。本项目不会自动点击页面选项，也不会自动提交答案。

## 部署到 EdgeOne

推荐部署方式是：先把本服务作为 Bun 源站运行在一台支持公网访问的 VPS、容器平台或云服务器上，再用 EdgeOne 接入域名并反向代理到该源站。这样可以保留 `/api/solve` 的 5 MiB base64 图片请求能力。

EdgeOne Edge Functions 当前是边缘 JavaScript 函数运行环境，并有请求体大小限制，不适合直接承载本项目默认的 Bun 常驻 HTTP 服务和大图 base64 payload。EdgeOne Makers 可以用于 Git/CLI 部署流程，但当前仓库不是静态站点或 Makers 函数包；如需原生 Makers/Functions 部署，需要先增加对应的函数适配入口，并把图片请求大小调到平台限制以内。

源站部署示例：

```sh
bun install --production
OCS_PUBLIC_BASE_URL=https://ocs-llm.example.com \
OCS_LLM_PROVIDER=openai-compatible \
OCS_LLM_BASE_URL=https://your-provider.example/v1 \
OCS_LLM_MODEL=your-model \
OCS_LLM_API_KEY=your-key \
bun run start
```

`OCS_PUBLIC_BASE_URL` 必须填写最终给 OCS 和浏览器脚本访问的 EdgeOne 域名。如果源站平台会注入 `PORT`，服务会优先使用该端口；否则默认监听 `3107`。

EdgeOne 控制台配置步骤：

1. 在 EdgeOne 中添加站点/域名，例如 `ocs-llm.example.com`。
2. 将源站配置为上一步运行服务的公网 HTTPS 地址或 IP:端口。
3. 确保 `/health`、`/api/ocs/config`、`/api/ocs/answer`、`/api/solve` 都走回源代理。
4. 配好 DNS/CNAME 和 HTTPS 证书。
5. 部署后验证：

```sh
curl -i https://ocs-llm.example.com/health
curl -i https://ocs-llm.example.com/api/ocs/config
curl -i -X POST https://ocs-llm.example.com/api/solve \
  -H "content-type: application/json" \
  --data '{"kind":"text","title":"1+1=?","type":"single","options":["A.1","B.2"]}'
```

验证通过后，在 OCS 中使用：

```txt
https://ocs-llm.example.com/api/ocs/config
```

浏览器桥接脚本里的 `apiBase` 也改成同一个 EdgeOne 域名：

```js
apiBase: "https://ocs-llm.example.com"
```

EdgeOne 相关官方文档：

- EdgeOne Makers 导入 Git 仓库：https://pages.edgeone.ai/document/importing-a-git-repository
- EdgeOne Makers CLI：https://pages.edgeone.ai/document/edgeone-cli
- EdgeOne Edge Functions 概览与限制：https://edgeone.ai/document/53372

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
