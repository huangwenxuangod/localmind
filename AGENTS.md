<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Project: AI同城行程履约系统 · MiniClaw

## 核心业务规则（固化不可修改）

1. **核心任务** = `type: "core"`，仅 `restaurant` 业态，失败必触发全局重排
2. **弱任务** = `type: "weak"`，失败重试3次+静默替换，不触发全局重排
3. **时间锁死**：用户指定起止时间不可修改，仅内部重构时序
4. **零时间重叠**：含通勤缓冲（walk:20 / bike:15 / drive:20 / transit:25 分钟）
5. **业态去重**：禁止连续同类业态
6. **约束降级**：level 0→1→2→3（放大半径→放宽饮食→全放宽），最大5次迭代
7. **极端兜底**：时间不足自动精简为单项核心任务

## 环境变量

```
OPENAI_API_KEY=                 # LLM解析（可选，无则本地兜底）
ARK_BASE_URL=                   # 默认 https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL_ID=                   # 豆包/Volcano Ark endpoint model id
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # 服务端写入用
```

## 当前实现边界

- `/api/run` 只负责解析、规划、预校验并输出 `plan_ready`
- 用户确认后由 `/api/execute-plan` 执行已保存方案
- Supabase 读取层必须做 snake_case → camelCase 映射，禁止直接 `data as Plan/Task/Session`
- Next.js 16.2.4 变更较大，写 Route Handler 前先读 `node_modules/next/dist/docs/`
