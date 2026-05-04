import type {
  AgentState, AgentPhase, SSEEvent, SSEEventType,
  TaskUpdatePayload, Task, TaskStatus, Plan,
} from "@/types";
import { buildItineraryPlan } from "../rules/honest-itinerary";
import { executeMerchantBooking } from "@/mock/fulfillment";
import { upsertSession, upsertPlan, upsertTasks, insertLog, insertExecution } from "@/lib/db/queries";

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

// ================================================================
// 长文本行程规划入口
// ================================================================
export async function runAgent(
  sessionId: string,
  userInput: string,
  emitter: SSEEmitter
): Promise<AgentState> {
  let state = makeInitialState(sessionId);

  try {
    await upsertSession(sessionId);
    insertLog({ sessionId, level: "info", phase: "idle", message: "会话已创建" });

    state = transition(state, "parsing");
    emit(emitter, "parsing_start", { sessionId });

    const { plan, debug } = await buildItineraryPlan(userInput, sessionId);
    state = { ...state, intent: plan.intent, plan };
    emit(emitter, "parsing_done", { intent: plan.intent, brief: plan.brief, source: debug.source });

    state = transition(state, "planning");
    emit(emitter, "planning_start", {});

    emit(emitter, "planning_done", {
      taskCount: plan.tasks.length,
      plannerSource: debug.source,
      persisted: false,
      message: "方案草稿已生成，正在做持久化闸门校验",
    });

    state = transition(state, "pre_validating");
    emit(emitter, "validation_start", { taskCount: plan.tasks.length });

    emit(emitter, "validation_done", {
      allReady: plan.validation?.every((item) => item.status !== "fail") ?? true,
      failedCount: plan.validation?.filter((item) => item.status === "fail").length ?? 0,
      report: plan.validation ?? [],
    });

    await upsertPlan(plan);
    await upsertTasks(plan.tasks);
    await upsertSession(sessionId, { currentPlanId: plan.id });
    insertLog({
      sessionId, planId: plan.id, level: "info", phase: "planning",
      message: "方案已生成",
      payload: {
        taskCount: plan.tasks.length,
        plannerSource: debug.source,
        llmDraft: debug.rawDraft,
        fallbackReason: debug.fallbackReason,
      },
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
// 已确认方案 mock 履约入口
// ================================================================
export async function executeConfirmedPlan(
  initialPlan: Plan,
  emitter: SSEEmitter
): Promise<AgentState> {
  let plan = initialPlan;
  const sessionId = plan.sessionId;
  let state: AgentState = {
    ...makeInitialState(plan.sessionId),
    phase: "executing",
    plan,
    intent: plan.intent,
    constraintLevel: plan.constraintLevel,
  };

  try {
    emit(emitter, "execution_start", { taskCount: plan.tasks.length });

    await upsertPlan({ ...plan, status: "executing" });

    const updatedTasks: Task[] = [];
    for (const task of plan.tasks) {
      emitTask(emitter, task.id, "executing");

      if (!task.merchant) {
        const failedTask = { ...task, status: "failed" as const, failureReason: "缺少可履约地点" };
        updatedTasks.push(failedTask);
        emitTask(emitter, task.id, "failed", failedTask);
        continue;
      }

      const result = await executeMerchantBooking(task.merchant.id, task.startTime, plan.intent.headcount);
      const nextTask = {
        ...task,
        status: result.success ? "success" as const : "failed" as const,
        failureReason: result.failureReason ?? null,
      };
      updatedTasks.push(nextTask);
      emitTask(emitter, task.id, nextTask.status, nextTask);
      await insertExecution({ ...result, taskId: task.id, planId: plan.id }, plan.id);
    }

    state = transition(state, "completed");
    plan = { ...plan, tasks: updatedTasks, status: "completed", updatedAt: new Date().toISOString() };
    state = { ...state, plan };
    emit(emitter, "execution_complete", { plan });

    await upsertPlan(plan);
    await upsertTasks(plan.tasks);
    await upsertSession(sessionId, { status: "completed", currentPlanId: plan.id });
    insertLog({
      sessionId, planId: plan.id, level: "info", phase: "completed",
      message: "行程履约完成",
      payload: {
        successCount: plan.tasks.filter((t: Task) => t.status === "success").length,
        totalCount: plan.tasks.length,
      },
    });

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

function emitTask(
  emitter: SSEEmitter,
  taskId: string,
  status: TaskStatus,
  detail?: Partial<Task>
) {
  const payload: TaskUpdatePayload = {
    taskId,
    status,
    merchant: detail?.merchant ?? undefined,
    failureReason: detail?.failureReason ?? undefined,
    retryCount: detail?.retryCount ?? undefined,
  };
  emit(emitter, "task_update", payload);
}
