@AGENTS.md

# MiniClaw — AI同城行程履约系统

## 项目背景
基于 OpenClaw 单 Agent 架构的全自动同城行程规划履约系统。摒弃 LangChain/LangGraph，采用「LLM语义解析 + 自研硬规则引擎 + 原子工具并行执行」核心模式。

聚焦个人用户短时同城出行场景，实现自然语言一键生成、智能编排、预校验核验、并行履约执行、故障自愈重排的全闭环。

## 当前阶段
V1.0 基础稳定版，核心链路已跑通。已完成：
- Supabase 持久化（sessions/plans/tasks/executions/system_logs）
- 方案生成与执行拆分（/api/run 只到 plan_ready，/api/execute-plan 负责确认后履约）
- 手动微调 UI（任务卡「换一家」按钮）
- 会话状态恢复（刷新后恢复未完成行程）
- Agent Memory 基础版（user_profiles 表 + 偏好注入 parser）
- Supabase 查询结果 snake_case → camelCase 映射

待完成：V1.1 用户认证接入、真实商家履约 API、Agent Memory 摘要改为 LLM 压缩。

## 关键决策
- 单 Agent 大一统，无多 Agent 过度设计
- LLM 仅辅助语义解析，核心逻辑全硬规则
- Next.js 16.2.4 + Bun + Supabase + Vercel
- 使用字节豆包/Volcano Ark 的 OpenAI 兼容接口，缺少环境变量时本地兜底解析
- Agent Memory 用 sessionId 作为临时 userId，V1.1 接入认证后替换
