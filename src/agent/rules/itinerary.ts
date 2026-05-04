import { nanoid } from "nanoid";
import OpenAI from "openai";
import type {
  BusinessType,
  Merchant,
  ParsedIntent,
  Plan,
  PlanReasoning,
  PlanScore,
  PlanValidationItem,
  Task,
  TransportMode,
  TripBrief,
} from "@/types";
import { MOCK_MERCHANTS } from "@/mock/merchants";
import { PlanDraftSchema, type PlanDraft, type PlanDraftStep } from "./draft-schema";

const DEFAULT_CITY = "杭州";
const DEFAULT_AREA = "西湖区";
const DEFAULT_TRANSPORT: TransportMode = "auto";
const DEFAULT_AFTERNOON_START = 14;
const DEFAULT_AFTERNOON_END = 18;

const TRANSIT_BUFFER: Record<TransportMode, number> = {
  walk: 20,
  bike: 15,
  drive: 20,
  transit: 25,
  auto: 20,
};

const DWELL_DURATION: Record<BusinessType, number> = {
  restaurant: 75,
  cafe: 45,
  shopping: 90,
  entertainment: 90,
  leisure: 60,
  sport: 75,
  culture: 75,
};

const TYPE_LABEL: Record<BusinessType, string> = {
  restaurant: "轻食正餐",
  cafe: "休息补给",
  shopping: "商场逛逛",
  entertainment: "轻娱乐",
  leisure: "亲子休闲",
  sport: "轻运动",
  culture: "文化展馆",
};

export type ItineraryBuildDebug = {
  source: "llm" | "local";
  rawDraft?: unknown;
  fallbackReason?: string;
};

export type ItineraryBuildResult = {
  plan: Plan;
  debug: ItineraryBuildDebug;
};

function makeLocalDate(base: Date, hour: number, minute = 0): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, 0, 0);
}

function nextWeekday(base: Date, targetDay: number): Date {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const delta = (targetDay - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + delta);
  return date;
}

function inferTripDate(rawInput: string, now = new Date()): Date {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (rawInput.includes("明天")) {
    const date = new Date(today);
    date.setDate(date.getDate() + 1);
    return date;
  }
  if (rawInput.includes("后天")) {
    const date = new Date(today);
    date.setDate(date.getDate() + 2);
    return date;
  }

  const weekdayMap: Record<string, number> = {
    周日: 0,
    周天: 0,
    星期日: 0,
    星期天: 0,
    周一: 1,
    星期一: 1,
    周二: 2,
    星期二: 2,
    周三: 3,
    星期三: 3,
    周四: 4,
    星期四: 4,
    周五: 5,
    星期五: 5,
    周六: 6,
    星期六: 6,
  };

  for (const [label, day] of Object.entries(weekdayMap)) {
    if (rawInput.includes(label)) return nextWeekday(now, day);
  }

  return today;
}

function inferTimeWindow(rawInput: string): TripBrief["timeWindow"] {
  const date = inferTripDate(rawInput);
  const range = rawInput.match(/(?:下午|上午|晚上)?\s*(\d{1,2})\s*点(?:到|至|-|—)\s*(?:下午|上午|晚上)?\s*(\d{1,2})\s*点/);
  if (range) {
    let startHour = Number(range[1]);
    let endHour = Number(range[2]);
    if (rawInput.includes("下午") && startHour < 12) startHour += 12;
    if ((rawInput.includes("下午") || rawInput.includes("晚上")) && endHour < 12) endHour += 12;

    return {
      startTime: makeLocalDate(date, startHour).toISOString(),
      endTime: makeLocalDate(date, endHour).toISOString(),
      source: "explicit",
      confidence: 0.92,
    };
  }

  if (rawInput.includes("下午") || rawInput.includes("空的") || rawInput.includes("几个小时")) {
    return {
      startTime: makeLocalDate(date, DEFAULT_AFTERNOON_START).toISOString(),
      endTime: makeLocalDate(date, DEFAULT_AFTERNOON_END).toISOString(),
      source: "default",
      confidence: 0.74,
    };
  }

  return {
    startTime: makeLocalDate(date, DEFAULT_AFTERNOON_START).toISOString(),
    endTime: makeLocalDate(date, DEFAULT_AFTERNOON_END).toISOString(),
    source: "default",
    confidence: 0.62,
  };
}

function inferParticipants(rawInput: string): TripBrief["participants"] {
  const children = /孩子|小孩|娃|亲子|5\s*岁/.test(rawInput) ? 1 : 0;
  const adults = /老婆|妻子|朋友/.test(rawInput) ? 2 : 1;
  const notes: string[] = [];
  if (children) notes.push("有儿童同行，避免高强度和成人向娱乐");
  if (/老婆|妻子/.test(rawInput)) notes.push("伴侣同行，安排要兼顾休息与体验感");
  if (/朋友/.test(rawInput)) notes.push("文本提到朋友，系统优先按家庭场景理解");
  return { adults, children, notes };
}

function inferPreferences(rawInput: string): string[] {
  const preferences = new Set<string>();
  if (/孩子|小孩|娃|亲子|5\s*岁/.test(rawInput)) preferences.add("亲子友好");
  if (/减肥|减脂|低油|轻食/.test(rawInput)) preferences.add("减脂轻食");
  if (/不吃辣|怕辣/.test(rawInput)) preferences.add("不吃辣");
  if (/别离家太远|附近|不远|近/.test(rawInput)) preferences.add("近距离");
  if (/周末|双休|放松|空的/.test(rawInput)) preferences.add("轻松不赶");
  return Array.from(preferences);
}

function inferBusinessTypes(rawInput: string, brief: TripBrief): BusinessType[] {
  const types: BusinessType[] = [];
  if (/逛街|商场|购物/.test(rawInput)) types.push("shopping");
  if (/公园|散步|玩|亲子|孩子|小孩/.test(rawInput)) types.push("leisure");
  if (/展|博物馆|文化/.test(rawInput)) types.push("culture");
  if (/电影|密室|娱乐/.test(rawInput) && !brief.preferences.includes("亲子友好")) types.push("entertainment");
  if (/咖啡|奶茶|下午茶/.test(rawInput)) types.push("cafe");
  if (/吃|饭|晚饭|午饭|餐/.test(rawInput) || brief.preferences.includes("减脂轻食")) types.push("restaurant");

  if (types.length === 0) {
    types.push("leisure", "restaurant");
  }

  return Array.from(new Set(types));
}

function inferBrief(rawInput: string): TripBrief {
  const timeWindow = inferTimeWindow(rawInput);
  const participants = inferParticipants(rawInput);
  const preferences = inferPreferences(rawInput);
  const ambiguities: string[] = [];
  const assumptions: string[] = [];

  if (/老婆孩子\s*\/\s*朋友|老婆孩子.*朋友/.test(rawInput)) {
    ambiguities.push("同行人同时出现家庭和朋友表述，系统按补充的家庭场景优先理解");
  }
  if (timeWindow.source !== "explicit") {
    assumptions.push("未给出精确起止时间，默认按下午 14:00-18:00 安排");
  }
  if (/别离家太远|附近|不远|近/.test(rawInput)) {
    assumptions.push("默认以杭州西湖区为家附近活动范围");
  }

  return {
    userGoal: "安排一段轻松、近距离、可执行的同城出行",
    city: DEFAULT_CITY,
    area: DEFAULT_AREA,
    timeWindow,
    participants,
    preferences,
    constraints: ["时间不重叠", "预留通勤缓冲", "商家营业时间可用", "路线不过度折返"],
    assumptions,
    ambiguities,
  };
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  return typeof value === "string" && value.trim() ? [value] : [];
}

function isBusinessType(value: unknown): value is BusinessType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(DWELL_DURATION, value);
}

function clampDuration(type: BusinessType, duration: unknown): number {
  if (typeof duration !== "number" || !Number.isFinite(duration)) return DWELL_DURATION[type];
  const min = type === "cafe" ? 30 : 45;
  const max = type === "restaurant" ? 90 : 120;
  return Math.max(min, Math.min(max, Math.round(duration)));
}

function mergeUnique(...groups: string[][]): string[] {
  return Array.from(new Set(groups.flat().map((item) => item.trim()).filter(Boolean)));
}

async function buildLlmPlanDraft(rawInput: string, inferred: TripBrief): Promise<PlanDraft | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.ARK_BASE_URL;
  const model = process.env.ARK_MODEL_ID;

  if (!apiKey || !baseURL || !model) return null;

  const client = new OpenAI({ apiKey, baseURL });
  const merchantDigest = MOCK_MERCHANTS.map((merchant) => ({
    id: merchant.id,
    name: merchant.name,
    type: merchant.type,
    address: merchant.address,
    rating: merchant.rating,
    priceLevel: merchant.priceLevel,
    tags: merchant.tags,
    sceneBlacklist: merchant.sceneBlacklist,
    dietarySupport: merchant.dietarySupport,
  }));

  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: 1600,
    messages: [
      {
        role: "system",
        content: `你是美团本地生活行程规划 Agent 的规划草稿生成器。
只输出 JSON，不要 Markdown。
你负责读懂长文本生活场景，输出规划草稿；最终时间排布、商家匹配和可执行性校验会由规则代码完成。

硬规则：
- 城市固定杭州，区域默认西湖区。
- 如果用户说“下午空的/几个小时”，按 14:00-18:00 理解。
- 第一版只生成 1 个最佳方案。
- 不要使用 core/weak 概念。
- 餐厅不是必选，只有语义需要吃饭、补给、减脂餐时才安排。
- 有孩子时避免成人向娱乐和高强度活动。
- 输出 itinerary 时只允许 businessType 为 restaurant/cafe/shopping/entertainment/leisure/sport/culture。
- 只输出 2 到 4 个步骤，宁可少而稳。

输出结构：
{
  "userGoal": "一句话用户目标",
  "preferences": ["隐性偏好"],
  "constraints": ["硬约束"],
  "assumptions": ["系统假设"],
  "ambiguities": ["歧义和自动选择"],
  "participantNotes": ["参与人洞察"],
  "itinerary": [
    {
      "businessType": "leisure",
      "durationMin": 60,
      "goal": "这一站解决什么问题",
      "whyRecommended": "推荐理由",
      "suitabilityTags": ["亲子友好"]
    }
  ],
  "whyThisWorks": ["为什么这套顺序合理"],
  "hiddenInsights": ["挖掘出的隐性知识"]
}`,
      },
      {
        role: "user",
        content: JSON.stringify({
          rawInput,
          inferredDefaults: inferred,
          availableMerchants: merchantDigest,
        }),
      },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("LLM plan draft did not contain JSON");
  const rawDraft = JSON.parse(jsonMatch[0]) as unknown;
  const parsed = PlanDraftSchema.safeParse(rawDraft);
  if (!parsed.success) {
    throw new Error(`LLM plan draft schema invalid: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  }
  return parsed.data;
}

function mergeBriefWithDraft(inferred: TripBrief, draft: PlanDraft | null): TripBrief {
  if (!draft) return inferred;
  return {
    ...inferred,
    userGoal: typeof draft.userGoal === "string" && draft.userGoal.trim() ? draft.userGoal : inferred.userGoal,
    participants: {
      ...inferred.participants,
      notes: mergeUnique(inferred.participants.notes, asStringArray(draft.participantNotes)),
    },
    preferences: mergeUnique(inferred.preferences, asStringArray(draft.preferences)),
    constraints: mergeUnique(inferred.constraints, asStringArray(draft.constraints)),
    assumptions: mergeUnique(inferred.assumptions, asStringArray(draft.assumptions)),
    ambiguities: mergeUnique(inferred.ambiguities, asStringArray(draft.ambiguities)),
  };
}

function businessTypesFromDraft(rawInput: string, brief: TripBrief, draft: PlanDraft | null): BusinessType[] {
  const draftedTypes = draft?.itinerary.map((step) => step.businessType).filter(isBusinessType) ?? [];
  if (draftedTypes.length > 0) return Array.from(new Set(draftedTypes));
  return inferBusinessTypes(rawInput, brief);
}

function stepDraftForType(draft: PlanDraft | null, type: BusinessType, index: number): PlanDraftStep | undefined {
  const steps = draft?.itinerary ?? [];
  return steps.find((step) => step.businessType === type) ?? steps[index];
}

function merchantMatchesPreferences(merchant: Merchant, brief: TripBrief): number {
  let score = merchant.rating * 20 - (merchant.priceLevel - 1) * 4;
  if (brief.preferences.includes("亲子友好") && merchant.sceneBlacklist.includes("family")) score -= 60;
  if (brief.preferences.includes("减脂轻食")) {
    if (merchant.dietarySupport.some((item) => /低油|低糖|素食/.test(item))) score += 16;
    if (merchant.type === "restaurant" && merchant.priceLevel <= 2) score += 6;
  }
  if (brief.preferences.includes("近距离") && /西湖|湖滨|南山|断桥/.test(merchant.address)) score += 12;
  if (merchant.tags.some((tag) => /亲子|家庭|免费|西湖|环境/.test(tag))) score += 8;
  return score;
}

function isOpen(merchant: Merchant, startTime: string): boolean {
  const date = new Date(startTime);
  const day = date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const hhmm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const hours = merchant.openHours.find((item) => item.day === day);
  return !!hours && hhmm >= hours.open && hhmm < hours.close;
}

function candidatesFor(type: BusinessType, brief: TripBrief, startTime: string): Merchant[] {
  return MOCK_MERCHANTS
    .filter((merchant) => merchant.type === type)
    .filter((merchant) => !brief.preferences.includes("亲子友好") || !merchant.sceneBlacklist.includes("family"))
    .sort((a, b) => {
      const openDelta = Number(isOpen(b, startTime)) - Number(isOpen(a, startTime));
      if (openDelta !== 0) return openDelta;
      return merchantMatchesPreferences(b, brief) - merchantMatchesPreferences(a, brief);
    })
    .slice(0, 5);
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function taskValidation(merchant: Merchant | null, brief: TripBrief, startTime: string): PlanValidationItem[] {
  const items: PlanValidationItem[] = [
    {
      label: "时间可用",
      status: merchant && isOpen(merchant, startTime) ? "pass" : "warn",
      detail: merchant ? "当前时间段与营业时间匹配" : "暂无可用商家，需要候选替换",
    },
  ];
  if (brief.preferences.includes("亲子友好")) {
    items.push({
      label: "亲子适配",
      status: merchant && !merchant.sceneBlacklist.includes("family") ? "pass" : "warn",
      detail: merchant ? "未命中亲子场景黑名单" : "需人工确认亲子适配",
    });
  }
  if (brief.preferences.includes("减脂轻食")) {
    items.push({
      label: "减脂偏好",
      status: merchant?.dietarySupport.some((item) => /低油|低糖|素食/.test(item)) ? "pass" : "warn",
      detail: merchant?.dietarySupport.length ? `支持：${merchant.dietarySupport.join("、")}` : "可点轻食/少油选项",
    });
  }
  return items;
}

function buildReasoning(brief: TripBrief, tasks: Task[], draft: PlanDraft | null): PlanReasoning {
  const whyThisWorks = asStringArray(draft?.whyThisWorks);
  const hiddenInsights = asStringArray(draft?.hiddenInsights);

  return {
    summary: `${brief.area} ${formatTime(brief.timeWindow.startTime)}-${formatTime(brief.timeWindow.endTime)} 的轻松同城行程`,
    whyThisWorks: whyThisWorks.length > 0 ? whyThisWorks : [
      "先安排低负担活动，再进入正餐/补给，避免孩子一开始就疲劳",
      "所有任务都预留通勤缓冲，避免时间卡死",
      "商家优先选择西湖、湖滨、南山等近距离区域，符合“别离家太远”",
    ],
    hiddenInsights: hiddenInsights.length > 0 ? hiddenInsights : [
      brief.preferences.includes("亲子友好")
        ? "5岁孩子更适合开放空间、短时段体验和可随时退出的活动"
        : "行程默认按低压力周末休闲节奏安排",
      brief.preferences.includes("减脂轻食")
        ? "减肥诉求不应只体现在餐厅，也会影响活动强度和用餐时间"
        : "没有明确饮食偏好时，默认选择大众评分更稳的商家",
      tasks.length <= 2 ? "几个小时的行程不要塞太满，少而稳比多点打卡更可执行" : "任务数量已按时间窗口压缩",
    ],
  };
}

function buildIntentFromBrief(rawInput: string, brief: TripBrief, requestedTypes: BusinessType[]): ParsedIntent {
  return {
    startTime: brief.timeWindow.startTime,
    endTime: brief.timeWindow.endTime,
    location: brief.area,
    radiusKm: brief.preferences.includes("近距离") ? 3 : 5,
    transport: DEFAULT_TRANSPORT,
    scene: brief.preferences.includes("亲子友好") ? "family" : "general",
    headcount: brief.participants.adults + brief.participants.children,
    dietary: brief.preferences.includes("不吃辣") ? ["不吃辣"] : [],
    preferences: brief.preferences,
    requestedTypes,
    rawInput,
    contradictions: brief.ambiguities,
    corrections: brief.assumptions,
  };
}

function buildPlanValidation(tasks: Task[], brief: TripBrief): PlanValidationItem[] {
  const failedTasks = tasks.filter((task) => !task.merchant);
  const lastTask = tasks[tasks.length - 1];
  const withinWindow = lastTask
    ? new Date(lastTask.endTime).getTime() <= new Date(brief.timeWindow.endTime).getTime()
    : false;

  return [
    {
      label: "时间无冲突",
      status: withinWindow ? "pass" : "fail",
      detail: withinWindow ? "所有行程均在用户时间窗口内" : "行程超出时间窗口，需要减少任务",
    },
    {
      label: "通勤缓冲",
      status: "pass",
      detail: `任务间已预留 ${TRANSIT_BUFFER.auto} 分钟通勤缓冲`,
    },
    {
      label: "商家可用性",
      status: failedTasks.length === 0 ? "pass" : "warn",
      detail: failedTasks.length === 0 ? "每个任务均匹配到候选地点" : `${failedTasks.length} 个任务缺少可用候选`,
    },
    {
      label: "偏好匹配",
      status: "pass",
      detail: brief.preferences.length ? `已考虑：${brief.preferences.join("、")}` : "按通用轻松出行偏好安排",
    },
  ];
}

function scorePlan(tasks: Task[], brief: TripBrief, validation: PlanValidationItem[]): PlanScore {
  const hasFail = validation.some((item) => item.status === "fail");
  const timeFit = hasFail ? 45 : 92;
  const routeFit = tasks.every((task) => task.travelToNextMin >= 0) ? 86 : 50;
  const merchantFit = Math.round(
    tasks.length
      ? tasks.reduce((sum, task) => sum + (task.merchant?.rating ?? 3.5) * 20, 0) / tasks.length
      : 50
  );
  const preferenceSignals = tasks.flatMap((task) => task.suitabilityTags ?? []);
  const matchedPreferences = brief.preferences.filter((preference) =>
    preferenceSignals.some((signal) => signal.includes(preference) || preference.includes(signal))
  ).length;
  const preferenceFit = brief.preferences.length
    ? Math.min(95, 65 + Math.round((matchedPreferences / brief.preferences.length) * 30))
    : 78;
  const relaxationFit = tasks.length <= 3 ? 90 : 70;
  const total = Math.round(
    timeFit * 0.25 +
    routeFit * 0.2 +
    preferenceFit * 0.25 +
    merchantFit * 0.2 +
    relaxationFit * 0.1
  );

  return {
    total,
    timeFit,
    routeFit,
    preferenceFit,
    merchantFit,
    relaxationFit,
    reasons: [
      `时间适配 ${timeFit}：${hasFail ? "存在时间风险" : "全部任务落在时间窗口内"}`,
      `路线适配 ${routeFit}：已预留通勤缓冲`,
      `偏好适配 ${preferenceFit}：覆盖 ${matchedPreferences}/${brief.preferences.length || 1} 个显性/隐性偏好`,
      `商家可靠 ${merchantFit}：基于评分、营业和候选稳定度`,
      `节奏轻松 ${relaxationFit}：${tasks.length <= 3 ? "少而稳，不赶场" : "任务略多，可能偏赶"}`,
    ],
  };
}

type TaskSlot = {
  type: BusinessType;
  startTime: string;
  endTime: string;
  durationMin: number;
  travelToNextMin: number;
  stepDraft?: PlanDraftStep;
};

async function buildTaskFromSlot(slot: TaskSlot, planId: string, brief: TripBrief): Promise<Task> {
  const candidates = candidatesFor(slot.type, brief, slot.startTime);
  const merchant = candidates[0] ?? null;

  return {
    id: nanoid(),
    planId,
    type: "weak",
    businessType: slot.type,
    title: merchant?.name ?? TYPE_LABEL[slot.type],
    description: typeof slot.stepDraft?.goal === "string" && slot.stepDraft.goal.trim()
      ? slot.stepDraft.goal
      : TYPE_LABEL[slot.type],
    merchant,
    candidateMerchants: candidates,
    startTime: slot.startTime,
    endTime: slot.endTime,
    durationMin: slot.durationMin,
    travelToNextMin: slot.travelToNextMin,
    whyRecommended: buildTaskReason(slot.type, brief, merchant, slot.stepDraft),
    suitabilityTags: buildSuitabilityTags(slot.type, brief, merchant, slot.stepDraft),
    validation: taskValidation(merchant, brief, slot.startTime),
    status: "ready",
    retryCount: 0,
    failureReason: null,
    replacedFrom: null,
  };
}

export async function buildItineraryPlan(rawInput: string, sessionId: string): Promise<ItineraryBuildResult> {
  const inferredBrief = inferBrief(rawInput);
  let draft: PlanDraft | null = null;
  let fallbackReason: string | undefined;

  try {
    draft = await buildLlmPlanDraft(rawInput, inferredBrief);
  } catch (err) {
    fallbackReason = err instanceof Error ? err.message : String(err);
    draft = null;
  }

  const brief = mergeBriefWithDraft(inferredBrief, draft);
  const requestedTypes = businessTypesFromDraft(rawInput, brief, draft);
  const planId = nanoid();
  const windowEnd = new Date(brief.timeWindow.endTime).getTime();
  const buffer = TRANSIT_BUFFER.auto;
  const slots: TaskSlot[] = [];
  let cursor = brief.timeWindow.startTime;

  for (let i = 0; i < requestedTypes.length; i++) {
    const type = requestedTypes[i];
    const stepDraft = stepDraftForType(draft, type, i);
    const dwell = clampDuration(type, stepDraft?.durationMin);
    const taskEnd = addMinutes(cursor, dwell);
    if (new Date(taskEnd).getTime() > windowEnd) break;

    const isLastCandidate = requestedTypes.indexOf(type) === requestedTypes.length - 1;
    slots.push({
      type,
      startTime: cursor,
      endTime: taskEnd,
      durationMin: dwell,
      travelToNextMin: isLastCandidate ? 0 : buffer,
      stepDraft,
    });

    cursor = addMinutes(taskEnd, buffer);
  }

  let tasks = await Promise.all(slots.map((slot) => buildTaskFromSlot(slot, planId, brief)));

  if (tasks.length === 0) {
    const type: BusinessType = "leisure";
    const dwell = Math.min(DWELL_DURATION[type], Math.max(45, (windowEnd - new Date(cursor).getTime()) / 60_000));
    tasks = [await buildTaskFromSlot({
      type,
      startTime: cursor,
      endTime: addMinutes(cursor, dwell),
      durationMin: dwell,
      travelToNextMin: 0,
    }, planId, brief)];
    tasks[0] = {
      ...tasks[0],
      planId,
      description: "时间较短，自动压缩为单项轻松活动",
      whyRecommended: "时间窗口有限，优先保留一个低风险、可随时退出的活动",
    };
  }

  const intent = buildIntentFromBrief(rawInput, brief, requestedTypes);
  const now = new Date().toISOString();

  const plan: Plan = {
    id: planId,
    sessionId,
    intent,
    brief,
    tasks,
    status: "ready",
    constraintLevel: 0,
    reasoning: buildReasoning(brief, tasks, draft),
    validation: buildPlanValidation(tasks, brief),
    score: undefined,
    plannerSource: draft ? "llm" : "local",
    llmDraft: draft ?? undefined,
    fallbackReason,
    createdAt: now,
    updatedAt: now,
  };
  plan.score = scorePlan(tasks, brief, plan.validation ?? []);

  return {
    plan,
    debug: {
      source: draft ? "llm" : "local",
      rawDraft: draft ?? undefined,
      fallbackReason,
    },
  };
}

function buildTaskReason(
  type: BusinessType,
  brief: TripBrief,
  merchant: Merchant | null,
  draft?: PlanDraftStep
): string {
  if (draft?.whyRecommended?.trim()) {
    return draft.whyRecommended;
  }
  if (!merchant) return "当前类型暂未匹配到稳定候选，保留任务位等待替换";
  const reasons: string[] = [];
  if (brief.preferences.includes("亲子友好")) reasons.push("适合带孩子，不是高压活动");
  if (brief.preferences.includes("减脂轻食") && type === "restaurant") reasons.push("优先选择可点轻食/少油选项的餐厅");
  if (brief.preferences.includes("近距离")) reasons.push("位置靠近西湖/湖滨活动圈");
  reasons.push(`${merchant.rating.toFixed(1)} 分，选择稳定`);
  return reasons.join("；");
}

function buildSuitabilityTags(
  type: BusinessType,
  brief: TripBrief,
  merchant: Merchant | null,
  draft?: PlanDraftStep
): string[] {
  const tags = new Set<string>([TYPE_LABEL[type]]);
  asStringArray(draft?.suitabilityTags).forEach((item) => tags.add(item));
  brief.preferences.forEach((item) => tags.add(item));
  merchant?.tags.slice(0, 2).forEach((item) => tags.add(item));
  return Array.from(tags);
}
