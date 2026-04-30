// MiniClaw 单Agent状态机 — 系统唯一决策中枢
// 对标 OpenClaw: Gateway(会话路由) + AgentRuntime(推理执行) + Tools(原子工具)
import type {
  AgentState, AgentPhase, SSEEvent, SSEEventType,
  TaskUpdatePayload, Task, TaskStatus, ParsedIntent, Plan,
} from "@/types";
import { buildDemoItineraryPlan } from "../rules/itinerary";
import { replanWithDegradedConstraints } from "../rules/planner";
import { preValidatePlan } from "../tools/validator";
import { executePlanParallel } from "../tools/executor";
import { upsertSession, upsertPlan, upsertTasks, insertLog, getUserMemory, upsertUserMemory } from "@/lib/db/queries";

export type SSEEmitter = (event: SSEEvent) => void;

function emit<T>(emitter: SSEEmitter, type: SSEEventType, payload: T) {
  emitter({ type, payload, timestamp: new Date().toISOString() });
}

function makeInitialState(sessionId: string): AgentState {
  return {
    sessionId,
    phase: "idle",
    plan: null,
    intent: null,
    constraintLevel: 0,
    iteration: 0,
    maxIterations: 5,
    error: null,
  };
}

// 状态机转换
function transition(state: AgentState, nextPhase: AgentPhase): AgentState {
  return { ...state, phase: nextPhase };
}

// 将本次行程格式化为 markdown 记忆片段
function formatTripMemory(intent: ParsedIntent, plan: Plan): string {
  const date = new Date(intent.startTime).toLocaleDateString("zh");
  const types = plan.tasks.map((t) => t.businessType).join("→");
  const merchants = plan.tasks.map((t) => t.merchant?.name ?? "待定").join("→");
  return `## ${date} ${intent.scene}出行\n- 时段：${new Date(intent.startTime).toLocaleTimeString("zh", { hour: "2-digit", minute: "2-digit" })}-${new Date(intent.endTime).toLocaleTimeString("zh", { hour: "2-digit", minute: "2-digit" })}\n- 业态：${types}\n- 商家：${merchants}\n- 人数：${intent.headcount}人\n- 交通：${intent.transport}\n- 饮食要求：${intent.dietary.join(",") || "无"}`;
}

// 用 LLM 压缩摘要（简化版：直接截取前 200 字，V1.1 升级 LLM 压缩）
function generateSummary(memoryMd: string): string {
  const lines = memoryMd.split("\n").filter((l) => l.trim() && !l.startsWith("##"));
  const summary = lines.slice(0, 5).join("；");
  return summary.length > 200 ? summary.slice(0, 200) + "..." : summary;
}

// ================================================================
// MiniClaw Agent 主入口
// ================================================================
export async function runAgent(
  sessionId: string,
  userInput: string,
  emitter: SSEEmitter
): Promise<AgentState> {
  let state = makeInitialState(sessionId);

  // 会话初始化落库
  await upsertSession(sessionId);
  insertLog({ sessionId, level: "info", phase: "idle", message: "会话已创建" });

  try {
    // ── Phase 1: Parse ──────────────────────────────────────────
    state = transition(state, "parsing");
    emit(emitter, "parsing_start", { sessionId });

    const plan = buildDemoItineraryPlan(userInput, sessionId);
    state = { ...state, intent: plan.intent, plan };
    emit(emitter, "parsing_done", { intent: plan.intent, brief: plan.brief });

    // ── Phase 2: Plan ───────────────────────────────────────────
    state = transition(state, "planning");
    emit(emitter, "planning_start", {});

    emit(emitter, "planning_done", { plan });

    await upsertPlan(plan);
    await upsertTasks(plan.tasks);
    await upsertSession(sessionId, { currentPlanId: plan.id });
    insertLog({
      sessionId, planId: plan.id, level: "info", phase: "planning",
      message: "方案已生成", payload: { taskCount: plan.tasks.length },
    });

    // ── Phase 3: Persisted validation report ────────────────────
    state = transition(state, "pre_validating");
    emit(emitter, "validation_start", { taskCount: plan.tasks.length });

    emit(emitter, "validation_done", {
      allReady: plan.validation?.every((item) => item.status !== "fail") ?? true,
      failedCount: plan.validation?.filter((item) => item.status === "fail").length ?? 0,
      report: plan.validation ?? [],
    });

    state = { ...state, plan, phase: "awaiting_confirm" };
    emit(emitter, "plan_ready", { plan });

    return state;

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    state = { ...state, phase: "error", error: message };
    emit(emitter, "error", { message });

    insertLog({
      sessionId, planId: state.plan?.id, level: "error", phase: state.phase,
      message, payload: { error: message },
    });
  }

  return state;
}

// ================================================================
// 已确认方案执行入口
// ================================================================
export async function executeConfirmedPlan(
  initialPlan: Plan,
  emitter: SSEEmitter
): Promise<AgentState> {
  let plan = initialPlan;
  const sessionId = plan.sessionId;
  const intent = plan.intent;
  let state: AgentState = {
    ...makeInitialState(plan.sessionId),
    phase: "executing",
    plan,
    intent: plan.intent,
    constraintLevel: plan.constraintLevel,
  };

  try {
    emit(emitter, "execution_start", { taskCount: plan.tasks.length });

    const createTaskEventCallback = () => (
      taskId: string,
      status: TaskStatus,
      detail?: Partial<Task>
    ) => {
      const payload: TaskUpdatePayload = {
        taskId,
        status,
        merchant: detail?.merchant ?? undefined,
        failureReason: detail?.failureReason ?? undefined,
        retryCount: detail?.retryCount ?? undefined,
      };
      emit(emitter, "task_update", payload);
      if (status === "replaced") {
        emit(emitter, "task_replaced", payload);
      }

      const currentTask = plan.tasks.find((t) => t.id === taskId);
      if (currentTask) {
        upsertTasks([{ ...currentTask, ...detail, status }]).catch(console.error);
      }
    };

    await upsertPlan({ ...plan, status: "executing" });

    let execReport = await executePlanParallel(plan, createTaskEventCallback());
    plan = execReport.updatedPlan;
    state = { ...state, plan };

    // 核心任务执行失败 → 梯度重排后重新执行
    while (execReport.needsReplan && state.iteration < state.maxIterations) {
      state = { ...state, iteration: state.iteration + 1 };
      emit(emitter, "replanning_start", {
        reason: "执行阶段核心任务失败",
        constraintLevel: state.constraintLevel + 1,
        iteration: state.iteration,
      });

      plan = replanWithDegradedConstraints(plan, execReport.failedCoreTaskId!);
      const reValidation = await preValidatePlan(plan);
      plan = { ...plan, tasks: reValidation.updatedTasks, status: "ready" };
      state = { ...state, plan, constraintLevel: plan.constraintLevel };

      emit(emitter, "replanning_done", { plan });
      emit(emitter, "execution_start", { taskCount: plan.tasks.length });

      await upsertPlan(plan);
      await upsertTasks(plan.tasks);
      insertLog({
        sessionId, planId: plan.id, level: "replan", phase: "replanning",
        message: "梯度重排完成（执行阶段）",
        payload: { constraintLevel: plan.constraintLevel, iteration: state.iteration },
      });

      execReport = await executePlanParallel(plan, createTaskEventCallback());
      plan = execReport.updatedPlan;
      state = { ...state, plan };
    }

    // ── Phase 5: Complete ───────────────────────────────────────
    state = transition(state, "completed");
    plan = { ...plan, status: "completed", updatedAt: new Date().toISOString() };
    state = { ...state, plan };
    emit(emitter, "execution_complete", { plan });

    await upsertPlan(plan);
    await upsertTasks(plan.tasks);
    await upsertSession(sessionId, { status: "completed", currentPlanId: plan.id });
    insertLog({
      sessionId, planId: plan.id, level: "info", phase: "completed",
      message: "行程履约完成",
      payload: {
        successCount: plan.tasks.filter((t: Task) => t.status === "success" || t.status === "replaced").length,
        totalCount: plan.tasks.length,
      },
    });

    // Agent Memory：保存本次行程记忆
    const prevMemory = await getUserMemory(sessionId);
    const newEntry = formatTripMemory(intent, plan);
    const updatedMd = prevMemory?.memoryMd ? `${prevMemory.memoryMd}\n\n${newEntry}` : newEntry;
    const newSummary = generateSummary(updatedMd);
    await upsertUserMemory({ id: sessionId, memoryMd: updatedMd, summary: newSummary });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    state = { ...state, phase: "error", error: message };
    emit(emitter, "error", { message });

    insertLog({
      sessionId, planId: state.plan?.id, level: "error", phase: state.phase,
      message, payload: { error: message },
    });
  }

  return state;
}
