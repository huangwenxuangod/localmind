// 并行执行引擎 — 全任务并行 + 分级故障自愈
import type { Plan, Task, ExecutionResult, TaskStatus } from "@/types";
import { executeMerchantBooking } from "@/mock/fulfillment";
import { getMerchantsByType } from "@/mock/merchants";
import { validateMerchant } from "@/mock/fulfillment";

const WEAK_RETRY_INTERVAL_MS = 5000;
const WEAK_MAX_RETRIES = 3;

export type TaskEventCallback = (taskId: string, status: TaskStatus, detail?: Partial<Task>) => void;

async function retryWithDelay(fn: () => Promise<boolean>, maxRetries: number, delayMs: number): Promise<boolean> {
  for (let i = 0; i <= maxRetries; i++) {
    if (await fn()) return true;
    if (i < maxRetries) await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

async function executeTask(
  task: Task,
  headcount: number,
  onEvent: TaskEventCallback
): Promise<{ task: Task; success: boolean }> {
  if (!task.merchant) {
    onEvent(task.id, "failed", { failureReason: "无商家信息" });
    return { task: { ...task, status: "failed", failureReason: "无商家信息" }, success: false };
  }

  onEvent(task.id, "executing");

  const result: ExecutionResult = await executeMerchantBooking(
    task.merchant.id,
    task.startTime,
    headcount
  );

  if (result.success) {
    onEvent(task.id, "success");
    return { task: { ...task, status: "success" }, success: true };
  }

  // 弱任务：重试+自动替换
  if (task.type === "weak") {
    onEvent(task.id, "failed", { failureReason: result.failureReason, retryCount: task.retryCount + 1 });

    const retried = await retryWithDelay(async () => {
      const r = await executeMerchantBooking(task.merchant!.id, task.startTime, headcount);
      return r.success;
    }, WEAK_MAX_RETRIES, WEAK_RETRY_INTERVAL_MS);

    if (retried) {
      onEvent(task.id, "success");
      return { task: { ...task, status: "success", retryCount: task.retryCount + WEAK_MAX_RETRIES }, success: true };
    }

    // 替换为同业态其他商家
    const alternatives = getMerchantsByType(task.businessType)
      .filter((m) => m.id !== task.merchant!.id);

    for (const alt of alternatives) {
      const valid = await validateMerchant(alt.id, task.startTime, task.endTime, headcount);
      if (!valid.available) continue;
      const r = await executeMerchantBooking(alt.id, task.startTime, headcount);
      if (r.success) {
        const updatedTask: Task = {
          ...task,
          merchant: alt,
          status: "replaced",
          replacedFrom: task.merchant.id,
        };
        onEvent(task.id, "replaced", { merchant: alt });
        return { task: updatedTask, success: true };
      }
    }

    onEvent(task.id, "failed", { failureReason: "重试及替换均失败" });
    return { task: { ...task, status: "failed", failureReason: "重试及替换均失败" }, success: false };
  }

  // 核心任务：直接返回失败，由上层触发重排
  onEvent(task.id, "failed", { failureReason: result.failureReason });
  return { task: { ...task, status: "failed", failureReason: result.failureReason ?? null }, success: false };
}

export interface ExecutionReport {
  updatedPlan: Plan;
  needsReplan: boolean; // 核心任务失败，需要全局重排
  failedCoreTaskId?: string;
}

export async function executePlanParallel(
  plan: Plan,
  onEvent: TaskEventCallback
): Promise<ExecutionReport> {
  const headcount = plan.intent.headcount;

  // 全并行执行
  const results = await Promise.all(
    plan.tasks.map((task) => executeTask(task, headcount, onEvent))
  );

  const updatedTasks = results.map((r) => r.task);
  const failedCoreTask = updatedTasks.find(
    (t) => t.type === "core" && t.status === "failed"
  );

  return {
    updatedPlan: { ...plan, tasks: updatedTasks, status: failedCoreTask ? "failed" : "completed" },
    needsReplan: !!failedCoreTask,
    failedCoreTaskId: failedCoreTask?.id,
  };
}
