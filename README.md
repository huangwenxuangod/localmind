# MiniClaw — 美团同城行程规划 Agent Demo

MiniClaw 是一个面向 C 端用户的本地生活 Agent Demo/MVP。它服务于“给美团/本地生活平台展示 Agent 能力”的场景：用户输入一段自然语言生活描述，系统理解出行目标、参与人、时间、偏好和隐性约束，然后生成 1 个具体、合理、可执行的同城行程方案。

当前重点是证明行程规划的合理性和可执行性，而不是复杂预约编排。

## 当前能力

- 长文本场景理解：支持“周末双休、老婆孩子、孩子 5 岁、老婆减肥、别离家太远”这类叙述输入。
- LLM 草稿 + 规则审核：LLM 负责读懂长文本并提出行程草稿，代码负责规范化、商家匹配、时间排布和可执行性校验。
- Zod 强校验：LLM 草稿必须通过 schema guard，失败则自动降级到本地 planner。
- 默认 demo 策略：城市固定杭州，默认西湖区；“下午空的”默认 14:00-18:00。
- 单最佳方案：第一版只输出 1 个最佳行程，不做多方案对比。
- 行程卡展示：时间、地点、业态、地址、推荐理由、适配标签。
- 可执行性校验：时间无冲突、通勤缓冲、商家可用性、偏好匹配。
- 方案评分：时间合理、路线稳定、偏好匹配、商家可靠、节奏轻松五维评分。
- 隐性偏好解释：亲子友好、减脂轻食、近距离、轻松不赶。
- 换一家：替换单个行程卡，并重新校验时间/通勤。
- Supabase 状态源：写入失败会中断并提示，不允许继续确认。
- mock 履约：用户确认后模拟执行。

## 重要产品规则

- 不再使用 `core/weak` 作为产品概念。
- `restaurant` 不是必选任务，只有用户表达吃饭、补给、减脂餐等需求时才安排。
- 场景允许多标签，但进入 `preferences/constraints`，不要强行塞进单一 `scene`。
- 用户确认前，方案必须已经成功保存到 Supabase。
- Supabase 写入失败时，前端必须显示错误，不能继续确认执行。
- 换一家默认不改变其他任务时间，但必须重新校验时间与通勤。
- 不做多 Agent；所有可信边界由规则代码和运行时校验承担。

## 运行方式

安装依赖：

```bash
bun install --force
```

开发服务：

```bash
bun run dev
```

如果 Bun shim 异常，可以直接走本地 Next CLI：

```bash
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000
```

打开：

```text
http://127.0.0.1:3000
```

## 验证

```bash
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/next/dist/bin/next build
```

## 环境变量

复制 `.env.example` 到 `.env.local`：

```env
# LLM 规划草稿（可选；无则走本地 demo planner）
OPENAI_API_KEY=
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL_ID=

# Supabase（demo 状态源，运行核心功能必填）
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## API

- `POST /api/run`：长文本理解、生成行程、保存方案，返回 SSE。
- `POST /api/confirm-plan`：确认或取消已有方案。
- `POST /api/execute-plan`：执行已确认方案，返回 SSE。
- `POST /api/replace-task`：替换单个行程卡，并返回替换后校验。
- `GET /api/session/restore`：恢复最近 active session 和方案。

## Supabase 迁移

线上 Supabase 必须执行最新版：

```text
supabase/schema.sql
```

Schema v2 会新增：

- `plans.raw_input`
- `plans.brief`
- `plans.reasoning`
- `plans.validation`
- `plans.score`
- `plans.planner_source`
- `plans.llm_draft`
- `plans.fallback_reason`
- `tasks.title`
- `tasks.description`
- `tasks.why_recommended`
- `tasks.suitability_tags`
- `tasks.validation`

旧字段 `plans.intent`、`plans.constraint_level`、`tasks.type`、`tasks.retry_count` 仍保留为兼容字段，不再承载产品逻辑。

## 目录

```text
src/agent/core/agent.ts          单 Agent 编排入口
src/agent/rules/itinerary.ts     LLM 草稿 + 规则审核行程规划器
src/agent/rules/draft-schema.ts  Zod 草稿 schema
src/app/page.tsx                 行程卡 Demo UI
src/app/api/*/route.ts           Next.js Route Handlers
src/lib/db/queries.ts            Supabase 写入和字段映射
src/mock/merchants.ts            Demo 商家/地点库
supabase/schema.sql              数据库结构
```

## 兼容说明

当前 Supabase `tasks.type` 字段仍是旧表兼容字段，代码写入时会给默认值以适配现有 schema。产品逻辑不要使用 `core/weak`。

## 规划架构

```text
长文本输入
  ↓
本地规则推断默认时间/参与人/偏好
  ↓
LLM 生成 TripBrief + itinerary 草稿（可选）
  ↓
Zod schema guard
  ↓
规则代码过滤非法 businessType、压缩任务数量、限制时长
  ↓
规则代码匹配 mock 商家、排时间、插入通勤缓冲
  ↓
规则代码生成可执行性校验
  ↓
规则代码生成 PlanScore
  ↓
保存 Supabase，成功后才允许确认执行
```
