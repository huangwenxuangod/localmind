// 行程编排规则引擎 — 硬规则，不依赖LLM
import type {
  ParsedIntent, Plan, Task, Merchant,
  BusinessType, SceneTag, TaskType,
} from "@/types";
import { MOCK_MERCHANTS } from "@/mock/merchants";
import { nanoid } from "nanoid";

// 通勤缓冲时间（分钟）
const TRANSIT_BUFFER: Record<string, number> = {
  walk: 20,
  bike: 15,
  drive: 20,
  transit: 25,
  auto: 20,
};

// 业态建议停留时长（分钟）
const DWELL_DURATION: Record<BusinessType, number> = {
  restaurant: 75,
  cafe: 45,
  shopping: 90,
  entertainment: 90,
  leisure: 60,
  sport: 90,
  culture: 75,
};

// 核心任务业态
const CORE_TYPES: BusinessType[] = ["restaurant"];

// 场景黑名单规则
function isSceneBlocked(merchant: Merchant, scene: SceneTag): boolean {
  return merchant.sceneBlacklist.includes(scene);
}

// 饮食禁忌过滤
function matchesDietary(merchant: Merchant, dietary: string[]): boolean {
  if (dietary.length === 0) return true;
  return dietary.every((d) => merchant.dietarySupport.includes(d));
}

function addMinutes(iso: string, min: number): string {
  return new Date(new Date(iso).getTime() + min * 60_000).toISOString();
}

// 四维评分：顺路度(暂简化为评分)+评分+人流避峰+价格
function scoreMerchant(m: Merchant, intent: ParsedIntent, slotStartIso: string): number {
  let score = m.rating * 20; // 0-100

  // 价格偏好（偏好低价加分）
  score -= (m.priceLevel - 1) * 5;

  // 人流高峰惩罚（12-13、18-20为高峰）
  const h = new Date(slotStartIso).getHours();
  const isPeak = (h >= 12 && h < 13) || (h >= 18 && h < 20);
  if (isPeak) score -= 10;

  return score;
}

// 根据约束等级过滤商家
function filterMerchants(
  type: BusinessType,
  intent: ParsedIntent,
  constraintLevel: number
): Merchant[] {
  return MOCK_MERCHANTS.filter((m) => {
    if (m.type !== type) return false;
    if (isSceneBlocked(m, intent.scene)) return false;

    // 约束降级: level 0=全约束 1=放大半径 2=放宽饮食 3=全放宽
    if (constraintLevel < 2 && !matchesDietary(m, intent.dietary)) return false;

    return true;
  });
}

export interface PlanningInput {
  intent: ParsedIntent;
  sessionId: string;
  constraintLevel?: number;
}

export function buildPlan(input: PlanningInput): Plan {
  const { intent, sessionId } = input;
  const constraintLevel = input.constraintLevel ?? 0;
  const planId = nanoid();

  const buffer = TRANSIT_BUFFER[intent.transport] ?? TRANSIT_BUFFER.auto;
  const totalMin =
    (new Date(intent.endTime).getTime() - new Date(intent.startTime).getTime()) / 60_000;

  // 按请求业态构建任务列表，优先保证餐饮排布
  const typesToPlan: BusinessType[] = [];

  // 确保餐饮在中心时间段
  const startH = new Date(intent.startTime).getHours();
  const endH = new Date(intent.endTime).getHours();
  const mealTime = (startH <= 12 && endH >= 13) || (startH <= 18 && endH >= 19);

  if (mealTime && !intent.requestedTypes.includes("restaurant")) {
    typesToPlan.push("restaurant");
  }
  typesToPlan.push(...intent.requestedTypes.filter((t) => t !== "restaurant"));
  if (!typesToPlan.includes("restaurant") && mealTime) {
    typesToPlan.unshift("restaurant");
  }

  // 去重业态（不连续重复同类）
  const deduped: BusinessType[] = [];
  for (const t of typesToPlan) {
    if (deduped[deduped.length - 1] !== t) deduped.push(t);
  }

  // 计算时间是否足够所有任务
  let requiredMin = 0;
  for (const t of deduped) {
    requiredMin += DWELL_DURATION[t] + buffer;
  }

  // 极端场景：时间不足，精简为单项（核心任务优先）
  let finalTypes = deduped;
  if (requiredMin > totalMin) {
    const coreType = deduped.find((t) => CORE_TYPES.includes(t));
    finalTypes = coreType ? [coreType] : [deduped[0]];
  }

  // 排布任务
  const tasks: Task[] = [];
  let cursor = intent.startTime;

  for (let i = 0; i < finalTypes.length; i++) {
    const type = finalTypes[i];
    const isLast = i === finalTypes.length - 1;
    const dwell = DWELL_DURATION[type];

    const candidates = filterMerchants(type, intent, constraintLevel)
      .sort((a, b) => scoreMerchant(b, intent, cursor) - scoreMerchant(a, intent, cursor));

    const taskEnd = addMinutes(cursor, dwell);
    const travelNext = isLast ? 0 : buffer;

    const taskType: TaskType = CORE_TYPES.includes(type) ? "core" : "weak";

    tasks.push({
      id: nanoid(),
      planId,
      type: taskType,
      businessType: type,
      merchant: candidates[0] ?? null,
      candidateMerchants: candidates.slice(0, 5),
      startTime: cursor,
      endTime: taskEnd,
      durationMin: dwell,
      travelToNextMin: travelNext,
      status: "pending",
      retryCount: 0,
      failureReason: null,
      replacedFrom: null,
    });

    cursor = addMinutes(taskEnd, travelNext);

    // 若下一任务超出结束时间则停止
    if (new Date(cursor) >= new Date(intent.endTime)) break;
  }

  return {
    id: planId,
    sessionId,
    intent,
    tasks,
    status: "planning",
    constraintLevel,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// 梯度约束降级重排
export function replanWithDegradedConstraints(
  plan: Plan,
  _failedTaskId: string
): Plan {
  void _failedTaskId;
  const nextLevel = Math.min(plan.constraintLevel + 1, 3);
  return buildPlan({
    intent: plan.intent,
    sessionId: plan.sessionId,
    constraintLevel: nextLevel,
  });
}
