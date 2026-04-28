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
ANTHROPIC_API_KEY=              # LLM解析（可选，无则本地兜底）
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # 服务端写入用
```
