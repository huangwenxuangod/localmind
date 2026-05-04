<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Project: MiniClaw · 美团同城行程规划 Agent Demo

## 产品定位

面向 C 端用户、用于给美团/本地生活平台展示的 Agent Demo/MVP。核心证明点不是“预约系统完整性”，而是：

1. 能读懂长文本生活场景
2. 能生成 1 个合理、具体、可执行的同城行程
3. 能解释推荐理由和隐性偏好判断
4. 能展示时间、通勤、商家可用性、偏好匹配等可执行性校验
5. 能支持单个行程卡「换一家」，并重新校验时间/通勤影响

## 固化规则

1. Demo 城市固定为杭州，默认区域为西湖区
2. “下午空的 / 出去玩几个小时”默认按 14:00-18:00
3. 第一版只输出 1 个最佳方案，不做多方案对比
4. `core/weak` 不是产品概念；不要再设计核心/弱任务逻辑
5. `restaurant` 不再是必选核心任务，只有用户语义需要吃饭/补给时才安排
6. 场景允许多标签，但产品模型中应表达为 `preferences/constraints`，不要塞进单一 `scene`
7. Supabase 是真实状态源；写入失败必须中断并提示，不允许前端继续确认
8. LLM 或启发式规划输出必须经过运行时校验，不能直接进入执行/持久化
9. 换一家只替换当前卡片，默认不改变其他任务时间，但必须重新校验时间/通勤
10. 不做多 Agent；LLM 只产出规划草稿，可信决策由规则代码完成
11. LLM 草稿必须通过 Zod schema guard；失败时走本地 planner
12. 方案必须生成 PlanScore，用于证明可执行性和推荐质量

## 环境变量

```
OPENAI_API_KEY=                 # LLM 规划（可选；无则走本地 demo planner）
ARK_BASE_URL=                   # 默认 https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL_ID=                   # 豆包/Volcano Ark endpoint model id
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # 服务端写入用
```

## 当前实现边界

- `/api/run` 负责长文本理解、LLM 草稿/本地兜底、规则校验、持久化和输出 `plan_ready`
- 用户确认后由 `/api/execute-plan` 执行已保存方案
- `/api/replace-task` 支持行程卡「换一家」并返回替换后校验
- Supabase schema v2 使用 `plans.brief/reasoning/validation/score/planner_source/llm_draft`
- Supabase 读取层必须做 snake_case → camelCase 映射，禁止直接 `data as Plan/Task/Session`
- 当前 Supabase `tasks.type` 是历史兼容字段，产品逻辑不要使用它
- Next.js 16.2.4 变更较大，写 Route Handler 前先读 `node_modules/next/dist/docs/`
