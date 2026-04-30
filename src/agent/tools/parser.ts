// LLM 语义解析模块 — 将用户自然语言解析为结构化意图
import type { ParsedIntent, BusinessType, SceneTag, TransportMode } from "@/types";

// 模糊时间映射（中文→小时数）
const FUZZY_TIME_MAP: Record<string, number> = {
  "早上": 8, "上午": 9, "中午": 12, "午饭": 12,
  "下午": 14, "傍晚": 17, "晚上": 18, "晚饭": 18,
  "夜晚": 20, "深夜": 22,
};

const FUZZY_DURATION_MAP: Record<string, number> = {
  "逛一会": 90, "随便转转": 90, "逛逛": 90,
  "玩一天": 480, "半天": 240, "一下午": 180,
};

const TRANSPORT_MAP: Record<string, TransportMode> = {
  "步行": "walk", "走路": "walk",
  "骑车": "bike", "骑行": "bike", "共享单车": "bike",
  "开车": "drive", "自驾": "drive",
  "地铁": "transit", "公交": "transit", "公共交通": "transit",
};

const SCENE_MAP: Record<string, SceneTag> = {
  "亲子": "family", "带娃": "family", "小朋友": "family",
  "长辈": "elder", "老人": "elder", "爸妈": "elder",
  "减脂": "diet", "减肥": "diet", "健身": "diet",
  "单人": "solo", "一个人": "solo",
  "情侣": "couple", "约会": "couple",
  "朋友": "social", "聚会": "social",
};

const BUSINESS_TYPE_MAP: Record<string, BusinessType> = {
  "吃饭": "restaurant", "餐厅": "restaurant", "正餐": "restaurant",
  "午饭": "restaurant", "晚饭": "restaurant", "饭": "restaurant",
  "咖啡": "cafe", "奶茶": "cafe", "茶饮": "cafe", "下午茶": "cafe",
  "购物": "shopping", "逛街": "shopping", "商场": "shopping",
  "娱乐": "entertainment", "密室": "entertainment", "电影": "entertainment",
  "休闲": "leisure", "散步": "leisure", "公园": "leisure",
  "博物馆": "culture", "展览": "culture",
  "运动": "sport", "健身": "sport",
};

const DIETARY_MAP: Record<string, string> = {
  "素食": "素食", "吃素": "素食",
  "清真": "清真", "不吃猪肉": "清真",
  "不吃辣": "不吃辣", "怕辣": "不吃辣",
  "海鲜过敏": "海鲜过敏", "不吃海鲜": "海鲜过敏",
  "低糖": "低糖", "低油": "低油",
};

const VALID_TRANSPORTS: TransportMode[] = ["walk", "bike", "drive", "transit", "auto"];
const VALID_SCENES: SceneTag[] = ["family", "elder", "diet", "solo", "couple", "social", "general"];
const VALID_BUSINESS_TYPES: BusinessType[] = [
  "restaurant",
  "cafe",
  "shopping",
  "entertainment",
  "leisure",
  "sport",
  "culture",
];

function extractKeyword<T>(text: string, map: Record<string, T>): T | null {
  for (const [key, val] of Object.entries(map)) {
    if (text.includes(key)) return val;
  }
  return null;
}

function extractAllKeywords<T>(text: string, map: Record<string, T>): T[] {
  const found = new Set<T>();
  for (const [key, val] of Object.entries(map)) {
    if (text.includes(key)) found.add(val);
  }
  return Array.from(found);
}

function isTransportMode(value: unknown): value is TransportMode {
  return typeof value === "string" && VALID_TRANSPORTS.includes(value as TransportMode);
}

function isSceneTag(value: unknown): value is SceneTag {
  return typeof value === "string" && VALID_SCENES.includes(value as SceneTag);
}

function isBusinessType(value: unknown): value is BusinessType {
  return typeof value === "string" && VALID_BUSINESS_TYPES.includes(value as BusinessType);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return typeof value === "string" && value.trim() ? [value] : [];
}

// 从文本中提取时间（支持 "下午3点"、"15:00"、"3点半" 等格式）
function extractTime(text: string, baseDate: Date): Date | null {
  // 标准格式 HH:MM
  const hhmm = text.match(/(\d{1,2}):(\d{2})/);
  if (hhmm) {
    const d = new Date(baseDate);
    d.setHours(Number(hhmm[1]), Number(hhmm[2]), 0, 0);
    return d;
  }
  // 中文格式 "X点Y分" / "X点半"
  const cnTime = text.match(/(\d{1,2})点(半|\d{1,2}分)?/);
  if (cnTime) {
    const h = Number(cnTime[1]);
    const m = cnTime[2] === "半" ? 30 : cnTime[2] ? Number(cnTime[2].replace("分", "")) : 0;
    const d = new Date(baseDate);
    d.setHours(h, m, 0, 0);
    return d;
  }
  // 模糊时间
  for (const [key, h] of Object.entries(FUZZY_TIME_MAP)) {
    if (text.includes(key)) {
      const d = new Date(baseDate);
      d.setHours(h, 0, 0, 0);
      return d;
    }
  }
  return null;
}

// 矛盾检测
function detectContradictions(input: string, intent: Partial<ParsedIntent>): string[] {
  const issues: string[] = [];
  if (intent.startTime && intent.endTime) {
    const diff = (new Date(intent.endTime).getTime() - new Date(intent.startTime).getTime()) / 60_000;
    if (diff < 30) issues.push("时间窗口过短（<30分钟），已自动延长至1小时");
    if (diff > 720) issues.push("时间跨度超过12小时，已按1天行程处理");
  }
  return issues;
}

// 本地硬规则兜底解析（LLM不可用时使用）
export function parseIntentLocally(rawInput: string): ParsedIntent {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 提取时间
  let startTime = extractTime(rawInput, today);
  let endTime: Date | null = null;

  const timeRange = rawInput.match(/从(.+?)到(.+?)(?:之间|结束|$)/);
  if (timeRange) {
    startTime = extractTime(timeRange[1], today) ?? startTime;
    endTime = extractTime(timeRange[2], today);
  }

  if (!startTime) {
    startTime = new Date(today);
    startTime.setHours(10, 0, 0, 0);
  }
  if (!endTime) {
    // 模糊时长
    for (const [key, min] of Object.entries(FUZZY_DURATION_MAP)) {
      if (rawInput.includes(key)) {
        endTime = new Date(startTime.getTime() + min * 60_000);
        break;
      }
    }
    if (!endTime) {
      endTime = new Date(startTime.getTime() + 3 * 60 * 60_000); // 默认3小时
    }
  }

  const intent: Partial<ParsedIntent> = {
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
  };

  const contradictions = detectContradictions(rawInput, intent);
  const corrections: string[] = [];

  // 自动修正：时间过短
  if (intent.startTime && intent.endTime) {
    const diff = (new Date(intent.endTime).getTime() - new Date(intent.startTime).getTime()) / 60_000;
    if (diff < 30) {
      endTime = new Date(startTime.getTime() + 60 * 60_000);
      intent.endTime = endTime.toISOString();
      corrections.push("时间窗口过短，已自动延长至1小时");
    }
  }

  // 位置提取（简单：取"在X"模式）
  const locMatch = rawInput.match(/在(.{2,8}?)(?:附近|周边|周围|逛|玩|吃)/);
  const location = locMatch ? locMatch[1] : "西湖区";

  // 半径（附近=2km，同城=10km）
  const radiusKm = rawInput.includes("同城") ? 10 : rawInput.includes("附近") ? 2 : 5;

  return {
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    location,
    radiusKm,
    transport: extractKeyword(rawInput, TRANSPORT_MAP) ?? "auto",
    scene: extractKeyword(rawInput, SCENE_MAP) ?? "general",
    headcount: Number(rawInput.match(/(\d+)个?人/)?.[1] ?? 2),
    dietary: extractAllKeywords(rawInput, DIETARY_MAP),
    preferences: [],
    requestedTypes: extractAllKeywords(rawInput, BUSINESS_TYPE_MAP),
    rawInput,
    contradictions,
    corrections,
  };
}

function chooseScene(rawScene: unknown, fallback: SceneTag): { scene: SceneTag; extraScenes: SceneTag[] } {
  if (isSceneTag(rawScene)) return { scene: rawScene, extraScenes: [] };

  if (Array.isArray(rawScene)) {
    const scenes = rawScene.filter(isSceneTag);
    const priority: SceneTag[] = ["family", "elder", "couple", "social", "solo", "diet", "general"];
    const scene = priority.find((candidate) => scenes.includes(candidate)) ?? fallback;
    return {
      scene,
      extraScenes: scenes.filter((candidate) => candidate !== scene),
    };
  }

  return { scene: fallback, extraScenes: [] };
}

function normalizeTimeRange(
  candidateStart: unknown,
  candidateEnd: unknown,
  fallback: ParsedIntent
): { startTime: string; endTime: string; corrections: string[]; contradictions: string[] } {
  const corrections: string[] = [];
  const contradictions: string[] = [];

  let start = typeof candidateStart === "string" ? new Date(candidateStart) : new Date(NaN);
  let end = typeof candidateEnd === "string" ? new Date(candidateEnd) : new Date(NaN);

  if (Number.isNaN(start.getTime())) {
    start = new Date(fallback.startTime);
    corrections.push("开始时间解析失败，已使用本地规则兜底");
  }

  if (Number.isNaN(end.getTime())) {
    end = new Date(fallback.endTime);
    corrections.push("结束时间解析失败，已使用本地规则兜底");
  }

  if (end.getTime() <= start.getTime()) {
    contradictions.push("结束时间早于或等于开始时间");
    end = new Date(start.getTime() + 3 * 60 * 60_000);
    corrections.push("结束时间无效，已按默认3小时行程修正");
  }

  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    corrections,
    contradictions,
  };
}

function normalizeParsedIntent(rawInput: string, fallback: ParsedIntent, parsed: Record<string, unknown>): ParsedIntent {
  const { scene, extraScenes } = chooseScene(parsed.scene, fallback.scene);
  const timeRange = normalizeTimeRange(parsed.startTime, parsed.endTime, fallback);

  const requestedTypes = Array.isArray(parsed.requestedTypes)
    ? parsed.requestedTypes.filter(isBusinessType)
    : fallback.requestedTypes;

  const normalizedTypes = requestedTypes.length > 0 ? requestedTypes : fallback.requestedTypes;
  const dedupedTypes = Array.from(new Set(normalizedTypes));

  const preferences = [
    ...asStringArray(fallback.preferences),
    ...asStringArray(parsed.preferences),
    ...extraScenes.map((item) => item === "diet" ? "减脂" : item),
  ];

  const dietary = [
    ...asStringArray(fallback.dietary),
    ...asStringArray(parsed.dietary),
  ];

  if (scene === "diet" || extraScenes.includes("diet") || rawInput.includes("减肥") || rawInput.includes("减脂")) {
    if (!preferences.includes("减脂")) preferences.push("减脂");
    if (!dietary.includes("低油")) dietary.push("低油");
  }

  return {
    startTime: timeRange.startTime,
    endTime: timeRange.endTime,
    location: typeof parsed.location === "string" && parsed.location.trim() ? parsed.location : fallback.location,
    radiusKm: typeof parsed.radiusKm === "number" && parsed.radiusKm > 0 ? parsed.radiusKm : fallback.radiusKm,
    transport: isTransportMode(parsed.transport) ? parsed.transport : fallback.transport,
    scene,
    headcount: typeof parsed.headcount === "number" && parsed.headcount > 0 ? parsed.headcount : fallback.headcount,
    dietary: Array.from(new Set(dietary)),
    preferences: Array.from(new Set(preferences)),
    requestedTypes: dedupedTypes,
    rawInput,
    contradictions: [
      ...fallback.contradictions,
      ...asStringArray(parsed.contradictions),
      ...asStringArray(parsed.contradiction),
      ...timeRange.contradictions,
    ],
    corrections: [
      ...fallback.corrections,
      ...asStringArray(parsed.corrections),
      ...asStringArray(parsed.correctionSuggestion),
      ...timeRange.corrections,
    ],
  };
}

import type { UserMemory } from "@/lib/db/queries";

// 判断是否需要加载完整记忆（关键词触发）
export function shouldLoadFullMemory(rawInput: string): boolean {
  const triggers = ["跟上次一样", "像上次", "跟之前", "照旧", "老样子"];
  return triggers.some((t) => rawInput.includes(t));
}

// 将记忆摘要注入 system prompt
export function buildSystemPromptWithMemory(
  basePrompt: string,
  memory: UserMemory | null
): string {
  if (!memory || !memory.summary) return basePrompt;
  return `${basePrompt}\n\n【用户历史偏好】\n${memory.summary}\n请结合以上偏好理解用户意图。`;
}

import OpenAI from "openai";

// LLM 增强解析（使用字节豆包 / OpenAI 兼容 SDK）
export async function parseIntentWithLLM(
  rawInput: string,
  memoryContext?: string
): Promise<ParsedIntent> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const ARK_BASE_URL = process.env.ARK_BASE_URL;
  const ARK_MODEL_ID = process.env.ARK_MODEL_ID;

  if (!OPENAI_API_KEY || !ARK_BASE_URL || !ARK_MODEL_ID) {
    console.warn("[Parser] Missing Doubao/OpenAI env vars, falling back to local rules");
    return parseIntentLocally(rawInput);
  }

  try {
    const client = new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: ARK_BASE_URL,
    });

    const today = new Date().toISOString().split("T")[0];
    const memorySection = memoryContext
      ? `\n\n【用户历史偏好与行程记录】\n${memoryContext}\n请结合以上信息理解用户当前意图，若用户提到"跟上次一样"等模糊指代，请参考历史记录自动补全。`
      : "";

    const systemPrompt = `你是一个同城行程意图解析器。将用户的自然语言出行请求解析为严格的JSON结构。
今天日期：${today}${memorySection}

规则：
1. 时间必须转换为 ISO 8601 格式（含日期）
2. 识别模糊时间语义（傍晚=17:00，下午=14:00，晚饭=18:00）
3. 识别矛盾点并提供修正建议
4. requestedTypes 可选值：restaurant/cafe/shopping/entertainment/leisure/sport/culture
5. transport 可选值：walk/bike/drive/transit/auto
6. scene 可选值：family/elder/diet/solo/couple/social/general
7. 如果用户没有明确说餐饮，但时间包含午饭/晚饭时段，仍要在requestedTypes加入restaurant

只输出JSON，不输出任何解释。`;

    const response = await client.chat.completions.create({
      model: ARK_MODEL_ID,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: rawInput },
      ],
      max_tokens: 1024,
      temperature: 0,
    });

    const text = response.choices[0]?.message?.content ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("LLM returned no valid JSON");

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return normalizeParsedIntent(rawInput, parseIntentLocally(rawInput), parsed);
  } catch (err) {
    console.error("[Parser] LLM parsing failed, using local fallback:", err);
    return parseIntentLocally(rawInput);
  }
}
