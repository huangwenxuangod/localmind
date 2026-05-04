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
import {
  DEFAULT_CURRENT_LOCATION,
  DIET_SCENARIO_RULES,
  LOCAL_LIFE_PLACES,
  SCENARIO_RULES,
  WEATHER_RULES,
  estimateRoute,
  getFoodProfile,
  getMetrics,
  getSceneProfile,
  localPlaceToMerchant,
} from "@/mock/local-life";
import type { LocalLifeBusinessType, LocalLifeLocation, LocalLifePlace, RouteProfile } from "@/mock/local-life";
import { PlanDraftSchema, type PlanDraft, type PlanDraftStep } from "./draft-schema";

const DEFAULT_CITY = "杭州";
const DEFAULT_AREA = "西湖区";
const DEFAULT_TRANSPORT: TransportMode = "auto";
const DEFAULT_AFTERNOON_START = 14;
const DEFAULT_AFTERNOON_END = 18;

const DWELL_DURATION: Record<BusinessType, number> = {
  restaurant: 75,
  cafe: 45,
  shopping: 105,
  entertainment: 90,
  leisure: 75,
  sport: 75,
  culture: 80,
};

const TYPE_LABEL: Record<BusinessType, string> = {
  restaurant: "餐饮补给",
  cafe: "休息补给",
  shopping: "商圈逛逛",
  entertainment: "轻娱乐",
  leisure: "轻松活动",
  sport: "轻运动",
  culture: "文化展馆",
};

type HonestDraft = PlanDraft | null;

export type ItineraryBuildDebug = {
  source: "llm" | "local";
  rawDraft?: unknown;
  fallbackReason?: string;
};

export type ItineraryBuildResult = {
  plan: Plan;
  debug: ItineraryBuildDebug;
};

type Candidate = {
  place: LocalLifePlace;
  merchant: Merchant;
  route: RouteProfile;
  score: number;
  reasons: string[];
  risks: string[];
};

type TaskSlot = {
  type: BusinessType;
  preferredTypes: LocalLifeBusinessType[];
  startTime: string;
  endTime: string;
  durationMin: number;
  travelToNextMin: number;
  stepDraft?: PlanDraftStep;
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

  return {
    startTime: makeLocalDate(date, DEFAULT_AFTERNOON_START).toISOString(),
    endTime: makeLocalDate(date, DEFAULT_AFTERNOON_END).toISOString(),
    source: "default",
    confidence: rawInput.includes("下午") || rawInput.includes("空的") ? 0.76 : 0.62,
  };
}

function inferParticipants(rawInput: string): TripBrief["participants"] {
  const children = /孩子|小孩|娃|亲子|5\s*岁|儿童/.test(rawInput) ? 1 : 0;
  const adults = /朋友/.test(rawInput) ? 2 : /老婆|妻子|老公|先生|太太|对象|女朋友|男朋友/.test(rawInput) ? 2 : 1;
  const notes: string[] = [];
  if (children) notes.push("有儿童同行，避免高强度、长排队和不可退出的活动");
  if (/老婆|妻子|老公|先生|太太|对象|女朋友|男朋友/.test(rawInput)) notes.push("伴侣同行，体验稳定和氛围感比堆点更重要");
  if (/朋友/.test(rawInput)) notes.push("朋友同行，优先商圈集中、适合聊天的动线");
  return { adults, children, notes };
}

function activeScenarioRules(rawInput: string) {
  return SCENARIO_RULES.filter((rule) => rule.triggerKeywords.some((keyword) => rawInput.includes(keyword)));
}

function activeDietRules(rawInput: string) {
  return DIET_SCENARIO_RULES.filter((rule) => rule.triggerKeywords.some((keyword) => rawInput.includes(keyword)));
}

function inferWeather(rawInput: string) {
  return WEATHER_RULES.find((rule) => rule.affectedTags.some((tag) => rawInput.includes(tag)) || rawInput.includes(rule.condition));
}

function mergeUnique(...groups: string[][]): string[] {
  return Array.from(new Set(groups.flat().map((item) => item.trim()).filter(Boolean)));
}

function inferPreferences(rawInput: string): string[] {
  const scenarioRules = activeScenarioRules(rawInput);
  const dietRules = activeDietRules(rawInput);
  const base: string[] = [];
  if (/附近|不远|近|别离家太远|家附近/.test(rawInput)) base.push("近距离");
  if (/空的|轻松|别太累|不赶/.test(rawInput)) base.push("轻松不赶");
  if (/杭州|西湖|湖滨|滨江|良渚|城西|黄龙/.test(rawInput)) base.push("杭州本地");
  return mergeUnique(base, ...scenarioRules.map((rule) => rule.inferredPreferences), ...dietRules.map((rule) => rule.inferredPreferences));
}

function inferBrief(rawInput: string): TripBrief {
  const timeWindow = inferTimeWindow(rawInput);
  const participants = inferParticipants(rawInput);
  const scenarioRules = activeScenarioRules(rawInput);
  const dietRules = activeDietRules(rawInput);
  const weatherRule = inferWeather(rawInput);
  const preferences = inferPreferences(rawInput);
  const constraints = mergeUnique(
    ["时间不重叠", "预留通勤缓冲", "商家营业时间可用", "路线不过度折返", "不编造未验证事实"],
    ...scenarioRules.map((rule) => rule.inferredConstraints),
    ...dietRules.map((rule) => rule.inferredConstraints),
    weatherRule ? [weatherRule.explanation] : []
  );
  const assumptions: string[] = [];
  const ambiguities: string[] = [];

  if (timeWindow.source !== "explicit") {
    assumptions.push("未给出精确起止时间，默认按下午 14:00-18:00 安排");
  }
  if (/附近|家附近|别离家太远/.test(rawInput)) {
    assumptions.push("未接入真实定位，默认从西湖区文三路附近出发");
  }
  if (!/杭州|西湖|湖滨|滨江|良渚|城西|黄龙/.test(rawInput)) {
    assumptions.push("Demo 城市固定为杭州，默认区域为西湖区");
  }
  if (/老婆孩子\s*\/\s*朋友|老婆孩子.*朋友/.test(rawInput)) {
    ambiguities.push("同行人表述存在家庭和朋友歧义，按更具体的家庭补充信息处理");
  }

  const userGoal = /朋友/.test(rawInput)
    ? "为朋友聚会生成一段可执行的同城行程"
    : participants.children > 0
      ? "为亲子/家庭场景生成轻松、可退出的同城行程"
      : "生成一段诚实、可执行的本地生活方案";

  return {
    userGoal,
    city: DEFAULT_CITY,
    area: DEFAULT_AREA,
    timeWindow,
    participants,
    preferences,
    constraints,
    assumptions,
    ambiguities,
  };
}

async function buildLlmPlanDraft(rawInput: string, inferred: TripBrief): Promise<PlanDraft | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.ARK_BASE_URL;
  const model = process.env.ARK_MODEL_ID;
  if (!apiKey || !baseURL || !model) return null;

  const client = new OpenAI({ apiKey, baseURL });
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "你是美团本地生活 Agent 的意图分析器。",
          "只能输出 JSON，不要推荐具体商家名、具体路线、实时价格、真实排队等未验证事实。",
          "你可以输出用户目标、偏好、约束、假设、歧义、隐性洞察，以及建议的业态序列。",
          "商家、路线、风险、最终评分将由规则代码二次校验决定。",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          rawInput,
          inferred,
          allowedBusinessTypes: ["restaurant", "cafe", "shopping", "entertainment", "leisure", "sport", "culture"],
        }),
      },
    ],
  });

  const content = completion.choices[0]?.message.content;
  if (!content) return null;
  return PlanDraftSchema.parse(JSON.parse(content));
}

function mergeBriefWithDraft(brief: TripBrief, draft: HonestDraft): TripBrief {
  if (!draft) return brief;
  return {
    ...brief,
    userGoal: draft.userGoal || brief.userGoal,
    preferences: mergeUnique(brief.preferences, draft.preferences),
    constraints: mergeUnique(brief.constraints, draft.constraints),
    assumptions: mergeUnique(brief.assumptions, draft.assumptions),
    ambiguities: mergeUnique(brief.ambiguities, draft.ambiguities),
    participants: {
      ...brief.participants,
      notes: mergeUnique(brief.participants.notes, draft.participantNotes),
    },
  };
}

function containsFoodNeed(rawInput: string, brief: TripBrief) {
  return /吃|饭|晚饭|午饭|餐|轻食|咖啡|下午茶|不吃辣|清淡|减脂|减肥|低油|低糖/.test(rawInput)
    || brief.preferences.some((item) => /不辣|清淡|减脂|低油|低糖|儿童友好/.test(item));
}

function businessSequence(rawInput: string, brief: TripBrief, draft: HonestDraft): BusinessType[] {
  const types: BusinessType[] = [];
  const draftTypes = draft?.itinerary.map((item) => item.businessType).filter((type) => type !== "restaurant" || containsFoodNeed(rawInput, brief)) ?? [];

  if (/逛街|商场|购物/.test(rawInput)) types.push("shopping");
  if (/博物馆|展|文化|室内/.test(rawInput)) types.push("culture");
  if (/电影|娱乐/.test(rawInput) && brief.participants.children === 0) types.push("entertainment");
  if (/咖啡|下午茶|休息/.test(rawInput)) types.push("cafe");
  if (/孩子|小孩|娃|亲子|公园|散步|玩|走走|西湖/.test(rawInput)) types.push("leisure");

  types.push(...draftTypes);
  if (containsFoodNeed(rawInput, brief)) types.push(/咖啡|下午茶/.test(rawInput) && !/晚饭|饭|餐/.test(rawInput) ? "cafe" : "restaurant");

  if (types.length === 0) types.push("leisure");
  const deduped = Array.from(new Set(types));
  if (deduped.length > 3) return deduped.slice(0, 3);
  return deduped;
}

function preferredLocalTypes(type: BusinessType, rawInput: string, brief: TripBrief): LocalLifeBusinessType[] {
  if (type === "leisure" && brief.participants.children > 0) {
    return /雨|下雨|热|高温/.test(rawInput) ? ["parent_child", "shopping", "culture", "leisure"] : ["parent_child", "leisure", "culture"];
  }
  return [type];
}

function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function clampDuration(type: BusinessType, duration: unknown): number {
  if (typeof duration !== "number" || !Number.isFinite(duration)) return DWELL_DURATION[type];
  const min = type === "cafe" ? 30 : 45;
  const max = type === "restaurant" ? 90 : 130;
  return Math.max(min, Math.min(max, Math.round(duration)));
}

function stepDraftForType(draft: HonestDraft, type: BusinessType, index: number) {
  if (!draft) return undefined;
  return draft.itinerary.find((item) => item.businessType === type) ?? draft.itinerary[index];
}

function slotDwell(type: BusinessType, draft: HonestDraft, index: number) {
  return clampDuration(type, stepDraftForType(draft, type, index)?.durationMin);
}

function buildSlots(rawInput: string, brief: TripBrief, draft: HonestDraft): TaskSlot[] {
  const types = businessSequence(rawInput, brief, draft);
  const planEnd = new Date(brief.timeWindow.endTime).getTime();
  const slots: TaskSlot[] = [];
  let cursor = brief.timeWindow.startTime;

  for (let index = 0; index < types.length; index++) {
    const type = types[index];
    const dwell = slotDwell(type, draft, index);
    const taskEnd = addMinutes(cursor, dwell);
    if (new Date(taskEnd).getTime() > planEnd) break;
    slots.push({
      type,
      preferredTypes: preferredLocalTypes(type, rawInput, brief),
      startTime: cursor,
      endTime: taskEnd,
      durationMin: dwell,
      travelToNextMin: 0,
      stepDraft: stepDraftForType(draft, type, index),
    });
    cursor = addMinutes(taskEnd, 15);
  }

  if (slots.length === 0) {
    slots.push({
      type: "leisure",
      preferredTypes: preferredLocalTypes("leisure", rawInput, brief),
      startTime: brief.timeWindow.startTime,
      endTime: addMinutes(brief.timeWindow.startTime, 60),
      durationMin: 60,
      travelToNextMin: 0,
    });
  }

  return slots;
}

function timeLabel(iso: string) {
  return String(new Date(iso).getHours()).padStart(2, "0");
}

function isOpen(place: LocalLifePlace, startTime: string, endTime: string) {
  if (place.operatingStatus !== "open") return false;
  const start = new Date(startTime);
  const end = new Date(endTime);
  const open = place.openHours.find((item) => item.day === start.getDay());
  if (!open) return false;
  const startStr = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
  const endStr = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
  return startStr >= open.open && endStr <= open.close;
}

function scoreCandidate(
  place: LocalLifePlace,
  route: RouteProfile,
  slot: TaskSlot,
  brief: TripBrief,
  rawInput: string
): Candidate {
  const metrics = getMetrics(place.id);
  const scene = getSceneProfile(place.id);
  const food = getFoodProfile(place.id);
  const hour = timeLabel(slot.startTime);
  const family = brief.participants.children > 0;
  const routeFit = Math.max(0, 100 - route.durationMin * 2 - (route.frictionLevel - 1) * 8);
  const trust = metrics ? (metrics.localUserApprovalScore + metrics.conversionSignalScore) / 2 : place.sourceConfidence * 80;
  const sceneFit = scene
    ? family
      ? scene.familyWithChildScore
      : /朋友/.test(rawInput)
        ? scene.friendsGatheringScore
        : /老婆|对象|约会|女朋友|男朋友/.test(rawInput)
          ? scene.coupleDateScore
          : scene.relaxationScore
    : 62;
  const dietFit = slot.type === "restaurant" || slot.type === "cafe"
    ? foodMatchScore(food, brief)
    : 75;
  const queuePenalty = metrics?.avgQueueMinByHour[hour] ? Math.min(18, metrics.avgQueueMinByHour[hour] / 2) : 0;
  const overRecommendedPenalty = metrics ? metrics.aiOverrecommendedRisk * 0.12 : 4;
  const touristPenalty = metrics ? metrics.touristTrapRisk * 0.1 : 3;
  const openPenalty = isOpen(place, slot.startTime, slot.endTime) ? 0 : 80;
  const score =
    sceneFit * 0.28 +
    routeFit * 0.22 +
    dietFit * 0.18 +
    trust * 0.18 +
    (metrics?.dealAttractivenessScore ?? 55) * 0.08 +
    place.rating * 20 * 0.06 -
    queuePenalty -
    overRecommendedPenalty -
    touristPenalty -
    openPenalty;

  const risks = buildRiskNotes(place, route, metrics?.aiOverrecommendedRisk ?? 35, metrics?.touristTrapRisk ?? 25, hour);
  return {
    place,
    merchant: localPlaceToMerchant(place),
    route,
    score,
    reasons: [
      `${place.businessDistrict} / ${place.district}`,
      `评分 ${place.rating.toFixed(1)}，${place.reviewCount.toLocaleString("zh-CN")} 条 mock 评价信号`,
      metrics?.hasDeal ? `可展示团购/优惠：${metrics.dealTags.join("、")}` : "无强优惠，按体验稳定性推荐",
      route.explanation,
    ],
    risks,
  };
}

function foodMatchScore(food: ReturnType<typeof getFoodProfile>, brief: TripBrief) {
  if (!food) return 55;
  let score = 70;
  if (brief.preferences.some((item) => /不辣|清淡/.test(item))) {
    score += food.tasteProfile.spicy <= 1 ? 16 : -28;
    score += food.tasteProfile.light >= 4 ? 10 : -10;
  }
  if (brief.preferences.some((item) => /减脂|低油|低糖/.test(item))) {
    score += food.dietTags.some((tag) => ["减脂友好", "低油", "低糖"].includes(tag)) ? 18 : -18;
  }
  if (brief.participants.children > 0) {
    score += food.dietTags.includes("儿童友好") ? 10 : -8;
  }
  return Math.max(0, Math.min(100, score));
}

function buildRiskNotes(
  place: LocalLifePlace,
  route: RouteProfile,
  aiRisk: number,
  touristRisk: number,
  hour: string
) {
  const notes: string[] = [];
  if (route.frictionLevel >= 4) notes.push("通勤摩擦偏高，只有偏好匹配明显时才保留");
  if (!route.childFriendly) notes.push("亲子场景下这段路需要谨慎，建议打车或减少步行");
  if (aiRisk >= 55) notes.push("属于 AI 容易重复推荐的热门点，需提示人流和体验预期");
  if (touristRisk >= 55) notes.push("游客热度高，可能不够本地化");
  if (place.businessType === "restaurant" && Number(hour) >= 17) notes.push("接近晚餐时段，排队/取号需实时确认");
  return notes;
}

function selectCandidate(
  slot: TaskSlot,
  from: LocalLifeLocation | LocalLifePlace,
  brief: TripBrief,
  rawInput: string,
  usedIds: Set<string>
): Candidate | null {
  const weatherRisk = Boolean(inferWeather(rawInput));
  const wanted = new Set(slot.preferredTypes);
  const pool = LOCAL_LIFE_PLACES
    .filter((place) => wanted.has(place.businessType) && !usedIds.has(place.id))
    .map((place) => scoreCandidate(
      place,
      estimateRoute(from, place, { mode: DEFAULT_TRANSPORT, familyWithChild: brief.participants.children > 0, weatherRisk }),
      slot,
      brief,
      rawInput
    ))
    .filter((candidate) => isOpen(candidate.place, slot.startTime, slot.endTime) || candidate.place.openHours.length > 0)
    .sort((a, b) => b.score - a.score);
  return pool[0] ?? null;
}

function routeToTaskEvidence(route: RouteProfile) {
  return {
    mode: route.mode as TransportMode,
    distanceMeters: route.distanceMeters,
    durationMin: route.durationMin,
    routeShape: route.routeShape,
    frictionLevel: route.frictionLevel,
    childFriendly: route.childFriendly,
    explanation: route.explanation,
  };
}

function taskValidation(candidate: Candidate | null, slot: TaskSlot, brief: TripBrief): PlanValidationItem[] {
  if (!candidate) {
    return [{ label: "候选匹配", status: "fail", detail: "没有找到满足当前业态和时间的地点" }];
  }
  const metrics = getMetrics(candidate.place.id);
  const food = getFoodProfile(candidate.place.id);
  const items: PlanValidationItem[] = [
    {
      label: "营业时间",
      status: isOpen(candidate.place, slot.startTime, slot.endTime) ? "pass" : "fail",
      detail: isOpen(candidate.place, slot.startTime, slot.endTime) ? "mock 营业时间覆盖该时段" : "mock 营业时间不覆盖该时段",
    },
    {
      label: "路线证据",
      status: candidate.route.frictionLevel <= 3 ? "pass" : "warn",
      detail: candidate.route.explanation,
    },
    {
      label: "诚实边界",
      status: "warn",
      detail: "地点名称和静态营业时间来自 mock/人工数据；实时排队、闭店、施工、天气需接入平台能力二次确认",
    },
  ];

  if (brief.participants.children > 0) {
    items.push({
      label: "亲子适配",
      status: candidate.route.childFriendly ? "pass" : "warn",
      detail: candidate.route.childFriendly ? "路线和地点强度对亲子可接受" : "亲子场景建议缩短停留或改打车",
    });
  }

  if (slot.type === "restaurant" || slot.type === "cafe") {
    items.push({
      label: "饮食适配",
      status: foodMatchScore(food, brief) >= 75 ? "pass" : "warn",
      detail: food ? `口味标签：${food.dietTags.join("、") || "未标注"}` : "缺少细粒度菜品/口味数据，只能按品类估计",
    });
  }

  if (metrics?.queueSupported) {
    items.push({
      label: "排队风险",
      status: "warn",
      detail: "可展示取号/排队能力，但当前为 mock 均值，执行前必须实时确认",
    });
  }

  return items;
}

function buildTask(slot: TaskSlot, planId: string, candidate: Candidate | null, brief: TripBrief): Task {
  const merchant = candidate?.merchant ?? null;
  const metrics = candidate ? getMetrics(candidate.place.id) : undefined;
  return {
    id: nanoid(),
    planId,
    type: "weak",
    businessType: slot.type,
    title: merchant?.name ?? TYPE_LABEL[slot.type],
    description: slot.stepDraft?.goal || TYPE_LABEL[slot.type],
    merchant,
    candidateMerchants: candidate ? candidateCandidates(slot, candidate.place.id) : [],
    startTime: slot.startTime,
    endTime: slot.endTime,
    durationMin: slot.durationMin,
    travelToNextMin: candidate?.route.durationMin ?? slot.travelToNextMin,
    whyRecommended: candidate
      ? `${candidate.place.name} 是当前约束下分数最高的可执行候选；${candidate.reasons.join("；")}`
      : "未找到可用地点，方案需要调整",
    suitabilityTags: mergeUnique(
      slot.stepDraft?.suitabilityTags ?? [],
      candidate ? [candidate.place.categoryL1, candidate.place.categoryL2, candidate.place.businessDistrict] : [],
      metrics?.dealTags ?? []
    ),
    validation: taskValidation(candidate, slot, brief),
    routeFromPrevious: candidate ? routeToTaskEvidence(candidate.route) : undefined,
    riskNotes: candidate?.risks ?? ["缺少可验证候选"],
    evidence: candidate?.reasons ?? [],
    dealTags: metrics?.dealTags ?? [],
    verification: {
      status: candidate ? "needs_realtime_check" : "unknown",
      notes: candidate
        ? ["已完成静态规则校验", "实时营业/排队/天气/施工未接入，确认前需平台二次校验"]
        : ["没有可用候选，不能进入确认"],
    },
    status: candidate ? "ready" : "failed",
    retryCount: 0,
    failureReason: candidate ? null : "没有找到可用地点",
    replacedFrom: null,
  };
}

function candidateCandidates(slot: TaskSlot, selectedId: string) {
  const wanted = new Set(slot.preferredTypes);
  return LOCAL_LIFE_PLACES
    .filter((place) => wanted.has(place.businessType))
    .sort((a, b) => (a.id === selectedId ? -1 : b.id === selectedId ? 1 : b.rating - a.rating))
    .slice(0, 5)
    .map(localPlaceToMerchant);
}

function rebuildTaskValidation(task: Task, brief: TripBrief): Task {
  if (!task.merchant || !task.routeFromPrevious) return task;
  const hasFoodNeed = task.businessType === "restaurant" || task.businessType === "cafe";
  const validation = [
    ...(task.validation ?? []).filter((item) => item.label !== "亲子适配" && item.label !== "饮食适配"),
    ...(brief.participants.children > 0
      ? [{
          label: "亲子适配",
          status: task.routeFromPrevious.childFriendly ? "pass" as const : "warn" as const,
          detail: task.routeFromPrevious.childFriendly ? "路线和地点强度对亲子可接受" : "亲子场景建议缩短停留或改打车",
        }]
      : []),
    ...(hasFoodNeed
      ? [{
          label: "饮食适配",
          status: "warn" as const,
          detail: "饮食为静态标签匹配，真实菜单和做法需要下单前确认",
        }]
      : []),
  ];
  return { ...task, validation };
}

function buildTasks(rawInput: string, planId: string, brief: TripBrief, draft: HonestDraft): Task[] {
  const slots = buildSlots(rawInput, brief, draft);
  const usedIds = new Set<string>();
  const tasks: Task[] = [];
  let from: LocalLifeLocation | LocalLifePlace = DEFAULT_CURRENT_LOCATION;

  for (const slot of slots) {
    const candidate = selectCandidate(slot, from, brief, rawInput, usedIds);
    if (candidate) {
      usedIds.add(candidate.place.id);
      from = candidate.place;
    }
    tasks.push(rebuildTaskValidation(buildTask(slot, planId, candidate, brief), brief));
  }

  return tasks.map((task, index) => ({
    ...task,
    travelToNextMin: index < tasks.length - 1 ? Math.max(10, tasks[index + 1]?.routeFromPrevious?.durationMin ?? 15) : 0,
  }));
}

function buildIntentFromBrief(rawInput: string, brief: TripBrief, tasks: Task[]): ParsedIntent {
  const requestedTypes = Array.from(new Set(tasks.map((task) => task.businessType)));
  return {
    startTime: brief.timeWindow.startTime,
    endTime: brief.timeWindow.endTime,
    location: brief.area,
    radiusKm: /全城|杭州/.test(rawInput) ? 20 : /附近|家附近|别离家太远/.test(rawInput) ? 3 : 8,
    transport: DEFAULT_TRANSPORT,
    scene: brief.participants.children > 0 ? "family" : /老婆|对象|约会|女朋友|男朋友/.test(rawInput) ? "couple" : /朋友/.test(rawInput) ? "social" : "general",
    headcount: brief.participants.adults + brief.participants.children,
    dietary: brief.preferences.filter((item) => /不辣|清淡|减脂|低油|低糖|素食/.test(item)),
    preferences: brief.preferences,
    requestedTypes,
    rawInput,
    contradictions: brief.ambiguities,
    corrections: brief.assumptions,
  };
}

function buildReasoning(brief: TripBrief, tasks: Task[], draft: HonestDraft): PlanReasoning {
  return {
    summary: `${brief.area} ${formatTime(brief.timeWindow.startTime)}-${formatTime(brief.timeWindow.endTime)} 的诚实可执行方案`,
    whyThisWorks: [
      "LLM 只负责意图和偏好草稿，最终地点由规则在杭州本地生活 mock 数据中选择",
      "每张卡都带静态营业、路线、场景和诚实边界校验，避免把未验证内容包装成确定事实",
      tasks.length > 1 ? "按先活动后补给/用餐的顺序组织，减少折返和赶场" : "时间或约束有限时保留最稳的一项活动",
      ...(draft?.whyThisWorks ?? []),
    ],
    hiddenInsights: mergeUnique(
      [
        "用户说“别太累”本质是在要求低摩擦、可随时退出，而不是单纯少安排地点",
        "本地生活 Agent 的可信度来自可验证证据链，不来自更会写攻略文案",
      ],
      draft?.hiddenInsights ?? []
    ),
  };
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function buildPlanValidation(tasks: Task[], brief: TripBrief): PlanValidationItem[] {
  const hasTaskFail = tasks.some((task) => task.status === "failed" || task.validation?.some((item) => item.status === "fail"));
  const endOk = tasks.length === 0 || new Date(tasks[tasks.length - 1].endTime).getTime() <= new Date(brief.timeWindow.endTime).getTime();
  const totalTravel = tasks.reduce((sum, task) => sum + (task.routeFromPrevious?.durationMin ?? 0), 0);
  return [
    {
      label: "时间窗口",
      status: endOk ? "pass" : "fail",
      detail: endOk ? "所有行程均落在用户时间窗口内" : "行程超出用户时间窗口",
    },
    {
      label: "路线摩擦",
      status: totalTravel <= 60 ? "pass" : totalTravel <= 90 ? "warn" : "fail",
      detail: `从 mock 当前位置出发，总通勤约 ${totalTravel} 分钟`,
    },
    {
      label: "商家可用性",
      status: hasTaskFail ? "fail" : "pass",
      detail: hasTaskFail ? "存在未通过静态可用性校验的卡片" : "所有卡片均匹配到静态可用候选",
    },
    {
      label: "二次校验",
      status: "warn",
      detail: "当前已完成规则二次校验；真实营业、排队、施工、天气、票务仍需接平台实时能力",
    },
    {
      label: "不瞎编约束",
      status: "pass",
      detail: "未验证的信息被标记为 mock/估计/需实时确认，不作为确定承诺",
    },
  ];
}

function buildScore(tasks: Task[], validation: PlanValidationItem[]): PlanScore {
  const hasFail = validation.some((item) => item.status === "fail");
  const avgFriction = tasks.length
    ? tasks.reduce((sum, task) => sum + (task.routeFromPrevious?.frictionLevel ?? 3), 0) / tasks.length
    : 3;
  const distanceFit = Math.round(Math.max(45, 100 - tasks.reduce((sum, task) => sum + ((task.routeFromPrevious?.distanceMeters ?? 0) / 1000) * 4, 0)));
  const timeFit = hasFail ? 45 : 92;
  const routeFit = Math.round(Math.max(40, 100 - avgFriction * 12));
  const sceneFit = tasks.some((task) => task.validation?.some((item) => item.label.includes("亲子") && item.status === "warn")) ? 78 : 90;
  const merchantTrust = Math.round(tasks.reduce((sum, task) => sum + ((task.merchant?.rating ?? 4) * 20), 0) / Math.max(1, tasks.length));
  const dealValue = tasks.some((task) => (task.dealTags ?? []).length > 0) ? 82 : 58;
  const friction = Math.round(Math.max(45, 100 - avgFriction * 14));
  const honestyFit = validation.some((item) => item.label === "二次校验") ? 88 : 70;
  const total = Math.round(
    timeFit * 0.18 +
    distanceFit * 0.16 +
    routeFit * 0.16 +
    sceneFit * 0.16 +
    merchantTrust * 0.14 +
    dealValue * 0.08 +
    friction * 0.06 +
    honestyFit * 0.06
  );
  return {
    total,
    timeFit,
    routeFit,
    preferenceFit: sceneFit,
    merchantFit: merchantTrust,
    relaxationFit: friction,
    distanceFit,
    sceneFit,
    merchantTrust,
    dealValue,
    friction,
    honestyFit,
    reasons: [
      `时间适配 ${timeFit}：${hasFail ? "存在静态校验失败" : "全部卡片落在时间窗口内"}`,
      `距离适配 ${distanceFit}：基于 mock 当前位置估算，不伪装成真实导航`,
      `路线稳定 ${routeFit}：按通勤摩擦和亲子可接受度计算`,
      `场景匹配 ${sceneFit}：结合亲子/朋友/约会等隐性偏好`,
      `商家可信 ${merchantTrust}：来自评分、评价量、人工入库置信度和本地认可信号`,
      `诚实度 ${honestyFit}：实时信息统一标注为需二次确认`,
    ],
  };
}

export async function buildItineraryPlan(rawInput: string, sessionId: string): Promise<ItineraryBuildResult> {
  const inferredBrief = inferBrief(rawInput);
  let draft: HonestDraft = null;
  let fallbackReason: string | undefined;

  try {
    draft = await buildLlmPlanDraft(rawInput, inferredBrief);
  } catch (err) {
    fallbackReason = err instanceof Error ? err.message : String(err);
    draft = null;
  }

  const brief = mergeBriefWithDraft(inferredBrief, draft);
  const planId = nanoid();
  const tasks = buildTasks(rawInput, planId, brief, draft);
  const validation = buildPlanValidation(tasks, brief);
  const now = new Date().toISOString();
  const plan: Plan = {
    id: planId,
    sessionId,
    intent: buildIntentFromBrief(rawInput, brief, tasks),
    rawInput,
    brief,
    tasks,
    status: validation.some((item) => item.status === "fail") ? "failed" : "ready",
    constraintLevel: 0,
    reasoning: buildReasoning(brief, tasks, draft),
    validation,
    score: buildScore(tasks, validation),
    plannerSource: draft ? "llm" : "local",
    llmDraft: draft ?? undefined,
    fallbackReason,
    createdAt: now,
    updatedAt: now,
  };

  return {
    plan,
    debug: {
      source: draft ? "llm" : "local",
      rawDraft: draft ?? undefined,
      fallbackReason,
    },
  };
}
