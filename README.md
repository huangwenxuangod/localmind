# MiniClaw — AI同城行程履约系统

MiniClaw 是一个基于单 Agent 架构的同城短时行程规划与履约原型。系统采用「LLM 语义解析 + 自研硬规则引擎 + 原子工具执行」模式：LLM 只负责把自然语言转成结构化意图，核心排程、约束降级、预校验、重排和履约都由硬规则控制。

## 当前状态

V1.0 基础链路已收口：

- 自然语言行程需求解析，支持豆包/Ark OpenAI 兼容接口；缺少 LLM 环境变量时自动走本地规则兜底。
- 硬规则排程：核心任务、弱任务、时间窗口、通勤缓冲、连续业态去重、约束降级、极端兜底。
- Supabase 持久化：`sessions`、`plans`、`tasks`、`executions`、`system_logs`、`user_profiles`。
- 方案生成与执行拆分：`/api/run` 只生成 ready 方案，用户确认后 `/api/execute-plan` 执行。
- 前端支持方案确认、任务卡「换一家」、刷新后恢复最近 active 会话。
- Agent Memory V1.0：以 `sessionId` 作为临时 user id，使用 `user_profiles.memory_md` 和 `summary` 注入解析上下文。

## 核心规则

这些业务规则是系统边界，不应随意修改：

1. 核心任务为 `type: "core"`，仅 `restaurant` 业态，失败触发全局重排。
2. 弱任务为 `type: "weak"`，失败重试 3 次并静默替换，不触发全局重排。
3. 用户指定起止时间锁死，不修改外部时间窗口。
4. 任务零时间重叠，通勤缓冲为 `walk:20`、`bike:15`、`drive:20`、`transit:25` 分钟。
5. 禁止连续同类业态。
6. 约束降级为 level `0 -> 1 -> 2 -> 3`，最大 5 次迭代。
7. 时间不足时自动精简为单项核心任务。

## 运行方式

安装依赖：

```bash
bun install --force
```

开发服务：

```bash
bun run dev
```

如果 Bun shim 异常，也可以直接走本地 Next CLI：

```bash
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000
```

打开：

```text
http://127.0.0.1:3000
```

## 验证

推荐验证命令：

```bash
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/next/dist/bin/next build
```

`bun run lint` 和 `bun run build` 也可用，但在 Windows 上如果 Bun bin remap 出错，优先使用上面的 Node 直连命令。

## 环境变量

复制 `.env.example` 到 `.env.local`，按需填写：

```env
# LLM 解析（可选，不填则本地硬规则兜底）
OPENAI_API_KEY=
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL_ID=

# Supabase（持久化必填）
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

服务端写入优先使用 `SUPABASE_SERVICE_ROLE_KEY`。如果缺少 Supabase 配置，生产构建不会被阻断，但运行 API 时无法完成真实持久化。

## API

- `POST /api/run`：创建 session，解析需求，生成并预校验方案，返回 SSE；结束点是 `plan_ready`。
- `POST /api/confirm-plan`：确认或取消已有方案，可附带微调。
- `POST /api/execute-plan`：执行已确认方案，返回 SSE 任务状态、替换、重排和完成事件。
- `POST /api/replace-task`：为单个任务替换同业态可用商家。
- `GET /api/session/restore`：恢复最近 active session 及其当前 plan/tasks。

## 目录

```text
src/agent/core/agent.ts        单 Agent 状态机
src/agent/rules/planner.ts     硬规则排程与约束降级
src/agent/tools/parser.ts      LLM/本地意图解析
src/agent/tools/validator.ts   商家预校验
src/agent/tools/executor.ts    并行执行、弱任务替换、核心失败重排
src/app/page.tsx               前端交互页面
src/app/api/*/route.ts         Next.js Route Handlers
src/lib/db/queries.ts          Supabase 写入与 snake_case/camelCase 映射
supabase/schema.sql            数据库结构
```
