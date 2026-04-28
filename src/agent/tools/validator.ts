// 预校验模块 — 批量校验商家有效性，带10分钟缓存
import type { Plan, Task, ValidationResult, Merchant } from "@/types";
import { validateMerchant } from "@/mock/fulfillment";
import { getMerchantsByType } from "@/mock/merchants";

// 内存缓存：key = merchantId+startTime, value = { result, expiresAt }
const validationCache = new Map<string, { result: ValidationResult; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function cacheKey(merchantId: string, startTime: string): string {
  return `${merchantId}::${startTime}`;
}

async function validateWithCache(
  merchantId: string,
  startTime: string,
  endTime: string,
  headcount: number
): Promise<ValidationResult> {
  const key = cacheKey(merchantId, startTime);
  const cached = validationCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }
  const result = await validateMerchant(merchantId, startTime, endTime, headcount);
  validationCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

export function clearExpiredCache() {
  const now = Date.now();
  for (const [k, v] of validationCache.entries()) {
    if (v.expiresAt <= now) validationCache.delete(k);
  }
}

// 为单个 Task 找到第一个可用商家
async function findAvailableMerchant(
  task: Task,
  headcount: number
): Promise<{ merchant: Merchant | null; reason?: string }> {
  for (const candidate of task.candidateMerchants) {
    const result = await validateWithCache(
      candidate.id,
      task.startTime,
      task.endTime,
      headcount
    );
    if (result.available) {
      return { merchant: candidate };
    }
  }
  return { merchant: null, reason: "所有候选商家均不可用" };
}

export interface ValidationReport {
  allReady: boolean;
  updatedTasks: Task[];
  failedTaskIds: string[];
}

// 批量预校验整个 Plan
export async function preValidatePlan(plan: Plan): Promise<ValidationReport> {
  const headcount = plan.intent.headcount;

  const results = await Promise.all(
    plan.tasks.map(async (task) => {
      if (!task.merchant && task.candidateMerchants.length === 0) {
        return { task: { ...task, status: "failed" as const, failureReason: "无候选商家" }, failed: true };
      }

      const { merchant, reason } = await findAvailableMerchant(task, headcount);
      if (merchant) {
        return {
          task: { ...task, merchant, status: "ready" as const, failureReason: null },
          failed: false,
        };
      }

      // 尝试扩大候选范围（同业态其他商家）
      const extras = getMerchantsByType(task.businessType)
        .filter((m) => !task.candidateMerchants.find((c) => c.id === m.id));

      for (const extra of extras) {
        const r = await validateWithCache(extra.id, task.startTime, task.endTime, headcount);
        if (r.available) {
          return {
            task: { ...task, merchant: extra, status: "ready" as const, failureReason: null },
            failed: false,
          };
        }
      }

      return {
        task: { ...task, status: "failed" as const, failureReason: reason ?? "无可用商家" },
        failed: true,
      };
    })
  );

  const updatedTasks = results.map((r) => r.task);
  const failedTaskIds = results.filter((r) => r.failed).map((r) => r.task.id);

  return {
    allReady: failedTaskIds.length === 0,
    updatedTasks,
    failedTaskIds,
  };
}
