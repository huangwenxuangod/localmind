@AGENTS.md

# MiniClaw — 美团同城行程规划 Agent Demo

## 项目背景

MiniClaw 是一个面向 C 端用户的同城行程规划 Agent Demo，用于展示本地生活平台如何从长文本生活场景中理解用户目标、挖掘隐性偏好，并生成可执行的行程卡。

当前重点是证明“规划合理且可执行”，不是证明复杂履约编排。系统保留 mock 履约，但产品主链路是：

长文本输入 → 场景理解 → 最佳行程方案 → 可执行性校验 → 用户确认 → mock 履约 / 换一家。

## 当前阶段

Demo MVP 核心版。已完成：

- 长文本 demo planner（固定杭州西湖区，下午默认 14:00-18:00）
- LLM 规划草稿 + 规则代码审核，不做多 Agent
- `TripBrief / PlanReasoning / PlanValidationItem` 新领域模型
- 单最佳行程卡展示
- 推荐理由、隐性偏好、可执行性校验展示
- Supabase 持久化失败中断，不再吞错
- `/api/run` 规划保存，`/api/execute-plan` 确认后执行
- `/api/replace-task` 换一家并重新校验时间/通勤

## 关键决策

- 不再使用 core/weak 作为产品概念
- 餐厅不是必选核心任务，只在语义需要时安排
- 多场景输入进入 preferences/constraints，而不是单一 scene
- Supabase 是 demo 的状态源；写库失败要直接暴露给前端
- 当前 `tasks.type` 只是旧表兼容字段，不能驱动产品逻辑
- LLM 原始草稿写入 system_logs，便于调试规划质量

## 下一步

- 用 Zod 或等价 schema 做运行时强校验
- 增加真实距离/地图/商圈数据
- 完善换一家后的路线级重新评分
