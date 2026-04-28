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

// LLM 增强解析（使用 Claude API）
export async function parseIntentWithLLM(
  rawInput: string,
  memoryContext?: string
): Promise<ParsedIntent> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.warn("[Parser] No ANTHROPIC_API_KEY, falling back to local rules");
    return parseIntentLocally(rawInput);
  }

  try {
    const { Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

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

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: rawInput }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("LLM returned no valid JSON");

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      ...parseIntentLocally(rawInput), // fallback fields
      ...parsed,
      rawInput,
    };
  } catch (err) {
    console.error("[Parser] LLM parsing failed, using local fallback:", err);
    return parseIntentLocally(rawInput);
  }
}
