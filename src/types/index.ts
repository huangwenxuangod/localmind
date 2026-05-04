// ============================================================
// Core Domain Types — AI同城行程履约系统
// ============================================================

// ---- Enums ----

export type TaskType = "core" | "weak";
export type TaskStatus =
  | "pending"
  | "validating"
  | "ready"
  | "executing"
  | "success"
  | "failed"
  | "replaced"
  | "replanning";

export type PlanStatus =
  | "parsing"
  | "planning"
  | "validating"
  | "ready"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export type TransportMode = "walk" | "bike" | "drive" | "transit" | "auto";

export type SceneTag =
  | "family"       // 亲子
  | "elder"        // 长辈
  | "diet"         // 减脂
  | "solo"         // 单人
  | "couple"       // 情侣
  | "social"       // 社交
  | "general";     // 通用

export type BusinessType =
  | "restaurant"   // 正餐
  | "cafe"         // 咖啡/茶饮
  | "shopping"     // 购物
  | "entertainment"// 娱乐
  | "leisure"      // 休闲
  | "sport"        // 运动
  | "culture";     // 文化/展览

// ---- User Intent (after LLM parsing) ----

export interface ParsedIntent {
  startTime: string;        // ISO 8601
  endTime: string;          // ISO 8601
  location: string;         // 出发/中心位置
  radiusKm: number;         // 搜索半径(km)
  transport: TransportMode;
  scene: SceneTag;
  headcount: number;
  dietary: string[];        // 饮食禁忌 e.g. ["素食","不吃辣"]
  preferences: string[];    // 用户偏好关键词
  requestedTypes: BusinessType[];
  rawInput: string;
  contradictions: string[]; // LLM检测到的矛盾点
  corrections: string[];    // 自动修正说明
}

// ---- Trip Planning Demo Domain ----

export type ValidationStatus = "pass" | "warn" | "fail";

export interface TripBrief {
  userGoal: string;
  city: string;
  area: string;
  timeWindow: {
    startTime: string;
    endTime: string;
    source: "explicit" | "inferred" | "default";
    confidence: number;
  };
  participants: {
    adults: number;
    children: number;
    notes: string[];
  };
  preferences: string[];
  constraints: string[];
  assumptions: string[];
  ambiguities: string[];
}

export interface PlanValidationItem {
  label: string;
  status: ValidationStatus;
  detail: string;
}

export interface PlanReasoning {
  summary: string;
  whyThisWorks: string[];
  hiddenInsights: string[];
}

export interface PlanScore {
  total: number;
  timeFit: number;
  routeFit: number;
  preferenceFit: number;
  merchantFit: number;
  relaxationFit: number;
  distanceFit?: number;
  sceneFit?: number;
  merchantTrust?: number;
  dealValue?: number;
  friction?: number;
  honestyFit?: number;
  reasons: string[];
}

// ---- Merchant ----

export interface Merchant {
  id: string;
  name: string;
  type: BusinessType;
  address: string;
  lat: number;
  lng: number;
  rating: number;           // 0-5
  priceLevel: 1 | 2 | 3 | 4;
  openHours: OpenHour[];
  capacity: number;         // 同时接待人数
  tags: string[];
  sceneBlacklist: SceneTag[];
  dietarySupport: string[];
}

export interface OpenHour {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sun
  open: string;  // "HH:mm"
  close: string; // "HH:mm"
}

// ---- Task ----

export interface Task {
  id: string;
  planId: string;
  // DB v1 compatibility only. Product logic must not branch on this field.
  type: TaskType;
  businessType: BusinessType;
  title?: string;
  description?: string;
  merchant: Merchant | null;
  candidateMerchants: Merchant[];
  startTime: string;        // ISO 8601
  endTime: string;          // ISO 8601
  durationMin: number;
  travelToNextMin: number;  // 到下一个任务的通勤时间
  whyRecommended?: string;
  suitabilityTags?: string[];
  validation?: PlanValidationItem[];
  routeFromPrevious?: {
    mode: TransportMode;
    distanceMeters: number;
    durationMin: number;
    routeShape: string;
    frictionLevel: number;
    childFriendly: boolean;
    explanation: string;
  };
  riskNotes?: string[];
  evidence?: string[];
  dealTags?: string[];
  verification?: {
    status: "verified" | "estimated" | "needs_realtime_check" | "unsafe" | "unknown";
    notes: string[];
  };
  status: TaskStatus;
  // DB v1 compatibility fields.
  retryCount: number;
  failureReason: string | null;
  replacedFrom: string | null; // 被替换的原商家ID
}

// ---- Plan ----

export interface Plan {
  id: string;
  sessionId: string;
  intent: ParsedIntent;
  rawInput?: string;
  brief?: TripBrief;
  tasks: Task[];
  status: PlanStatus;
  // DB v1 compatibility only.
  constraintLevel: number;   // 约束降级层级 0=满约束 1=放大半径 2=放宽业态 3=放宽偏好
  reasoning?: PlanReasoning;
  validation?: PlanValidationItem[];
  score?: PlanScore;
  plannerSource?: "llm" | "local";
  llmDraft?: unknown;
  fallbackReason?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Session ----

export interface Session {
  id: string;
  currentPlanId: string | null;
  status: "active" | "completed" | "abandoned";
  createdAt: string;
  updatedAt: string;
}

// ---- SSE Events ----

export type SSEEventType =
  | "session_created"
  | "parsing_start"
  | "parsing_done"
  | "planning_start"
  | "planning_done"
  | "validation_start"
  | "validation_progress"
  | "validation_done"
  | "plan_ready"
  | "execution_start"
  | "task_update"
  | "task_replaced"
  | "replanning_start"
  | "replanning_done"
  | "execution_complete"
  | "error";

export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  payload: T;
  timestamp: string;
}

export interface TaskUpdatePayload {
  taskId: string;
  status: TaskStatus;
  merchant?: Merchant;
  failureReason?: string;
  retryCount?: number;
}

// ---- Agent State (MiniClaw State Machine) ----

export type AgentPhase =
  | "idle"
  | "parsing"
  | "planning"
  | "pre_validating"
  | "awaiting_confirm"
  | "executing"
  | "replanning"
  | "completed"
  | "error";

export interface AgentState {
  sessionId: string;
  phase: AgentPhase;
  plan: Plan | null;
  intent: ParsedIntent | null;
  constraintLevel: number;
  iteration: number;         // 重排次数
  maxIterations: number;     // 最大重排次数(防无限循环)
  error: string | null;
}

// ---- Validation Result ----

export interface ValidationResult {
  merchantId: string;
  available: boolean;
  reason?: string; // 失败原因
}

// ---- Execution Result ----

export interface ExecutionResult {
  id?: string;
  planId?: string;
  taskId: string;
  success: boolean;
  merchant: Merchant | null;
  failureReason?: string;
  executedAt: string;
}
