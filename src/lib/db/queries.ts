import { getDb } from "./supabase";
import type {
  Plan,
  Task,
  ExecutionResult,
  Session,
  PlanStatus,
  TaskStatus,
  TaskType,
  BusinessType,
  ParsedIntent,
  TripBrief,
  PlanReasoning,
  PlanValidationItem,
  PlanScore,
} from "@/types";

type StoredPlanIntent = ParsedIntent & {
  __brief?: TripBrief;
  __reasoning?: PlanReasoning;
  __validation?: PlanValidationItem[];
};

type PlanRow = {
  id: string;
  session_id: string;
  intent?: StoredPlanIntent;
  raw_input?: string;
  brief?: TripBrief;
  reasoning?: PlanReasoning;
  validation?: PlanValidationItem[];
  score?: PlanScore;
  planner_source?: "llm" | "local";
  llm_draft?: unknown;
  fallback_reason?: string | null;
  status: PlanStatus;
  constraint_level: number;
  created_at: string;
  updated_at: string;
};

type TaskRow = {
  id: string;
  plan_id: string;
  type: TaskType;
  business_type: BusinessType;
  title?: string;
  description?: string | null;
  merchant: Task["merchant"];
  candidate_merchants: Task["candidateMerchants"];
  start_time: string;
  end_time: string;
  duration_min: number;
  travel_to_next_min: number;
  status: TaskStatus;
  retry_count: number;
  failure_reason: string | null;
  replaced_from: string | null;
  why_recommended?: string | null;
  suitability_tags?: string[];
  validation?: PlanValidationItem[];
};

type SessionRow = {
  id: string;
  current_plan_id: string | null;
  status: Session["status"];
  created_at: string;
  updated_at: string;
};

function mapPlan(row: PlanRow): Plan {
  const fallbackIntent = row.intent;
  const { __brief, __reasoning, __validation, ...legacyIntent } = fallbackIntent ?? {};
  const legacyParsedIntent = legacyIntent as Partial<ParsedIntent>;
  const rawInput = row.raw_input ?? legacyParsedIntent.rawInput ?? "";
  const brief = row.brief ?? __brief;
  const reasoning = row.reasoning ?? __reasoning;
  const validation = row.validation ?? __validation;
  const intent = Object.keys(legacyIntent).length > 0
    ? legacyParsedIntent as ParsedIntent
    : {
        startTime: brief?.timeWindow.startTime ?? new Date().toISOString(),
        endTime: brief?.timeWindow.endTime ?? new Date().toISOString(),
        location: brief?.area ?? "西湖区",
        radiusKm: 3,
        transport: "auto",
        scene: brief?.preferences.includes("亲子友好") ? "family" : "general",
        headcount: (brief?.participants.adults ?? 1) + (brief?.participants.children ?? 0),
        dietary: [],
        preferences: brief?.preferences ?? [],
        requestedTypes: [],
        rawInput,
        contradictions: brief?.ambiguities ?? [],
        corrections: brief?.assumptions ?? [],
      } satisfies ParsedIntent;

  return {
    id: row.id,
    sessionId: row.session_id,
    intent,
    rawInput,
    brief,
    tasks: [],
    status: row.status,
    constraintLevel: row.constraint_level ?? 0,
    reasoning,
    validation,
    score: row.score,
    plannerSource: row.planner_source,
    llmDraft: row.llm_draft,
    fallbackReason: row.fallback_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    planId: row.plan_id,
    type: row.type,
    businessType: row.business_type,
    title: row.title ?? row.merchant?.name ?? row.business_type,
    description: row.description ?? row.business_type,
    merchant: row.merchant,
    candidateMerchants: row.candidate_merchants,
    startTime: row.start_time,
    endTime: row.end_time,
    durationMin: row.duration_min,
    travelToNextMin: row.travel_to_next_min,
    status: row.status,
    retryCount: row.retry_count,
    failureReason: row.failure_reason,
    replacedFrom: row.replaced_from,
    whyRecommended: row.why_recommended ?? undefined,
    suitabilityTags: row.suitability_tags ?? undefined,
    validation: row.validation ?? undefined,
  };
}

function mapSession(row: SessionRow): Session {
  return {
    id: row.id,
    currentPlanId: row.current_plan_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function upsertSession(
  sessionId: string,
  update?: { status?: string; currentPlanId?: string | null }
) {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    id: sessionId,
    status: update?.status ?? "active",
    updated_at: now,
  };
  if (update?.currentPlanId !== undefined) {
    row.current_plan_id = update.currentPlanId;
  }
  const { error } = await getDb().from("sessions").upsert(row);
  if (error) throw new Error(`[DB] upsertSession failed: ${error.message}`);
}

// ── Plans ─────────────────────────────────────────────────────────────────────

export async function upsertPlan(plan: Plan) {
  const storedIntent: StoredPlanIntent = {
    ...plan.intent,
    __brief: plan.brief,
    __reasoning: plan.reasoning,
    __validation: plan.validation,
  };
  const { error } = await getDb().from("plans").upsert({
    id: plan.id,
    session_id: plan.sessionId,
    raw_input: plan.rawInput ?? plan.intent.rawInput,
    brief: plan.brief,
    reasoning: plan.reasoning,
    validation: plan.validation,
    score: plan.score,
    planner_source: plan.plannerSource ?? "local",
    llm_draft: plan.llmDraft ?? null,
    fallback_reason: plan.fallbackReason ?? null,
    intent: storedIntent,
    status: plan.status,
    constraint_level: plan.constraintLevel,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`[DB] upsertPlan failed: ${error.message}`);
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function upsertTasks(tasks: Task[]) {
  if (tasks.length === 0) return;
  const rows = tasks.map((t) => ({
    id: t.id,
    plan_id: t.planId,
    type: t.type,
    business_type: t.businessType,
    title: t.title ?? t.merchant?.name ?? t.businessType,
    description: t.description ?? null,
    merchant: t.merchant,
    candidate_merchants: t.candidateMerchants,
    start_time: t.startTime,
    end_time: t.endTime,
    duration_min: t.durationMin,
    travel_to_next_min: t.travelToNextMin,
    status: t.status,
    retry_count: t.retryCount,
    failure_reason: t.failureReason,
    replaced_from: t.replacedFrom,
    why_recommended: t.whyRecommended ?? null,
    suitability_tags: t.suitabilityTags ?? [],
    validation: t.validation ?? [],
    updated_at: new Date().toISOString(),
  }));
  const { error } = await getDb().from("tasks").upsert(rows);
  if (error) throw new Error(`[DB] upsertTasks failed: ${error.message}`);
}

// ── Executions ────────────────────────────────────────────────────────────────

export async function insertExecution(result: ExecutionResult, planId: string) {
  const { error } = await getDb().from("executions").insert({
    task_id: result.taskId,
    plan_id: planId,
    success: result.success,
    merchant: result.merchant,
    failure_reason: result.failureReason ?? null,
    executed_at: result.executedAt,
  });
  if (error) throw new Error(`[DB] insertExecution failed: ${error.message}`);
}

// ── Queries ────────────────────────────────────────────────────────────────────

export async function getTaskById(taskId: string): Promise<Task | null> {
  const { data, error } = await getDb()
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .single();
  if (error) {
    console.error("[DB] getTaskById failed:", error.message);
    return null;
  }
  return mapTask(data as TaskRow);
}

export async function getPlanById(planId: string): Promise<Plan | null> {
  const { data, error } = await getDb()
    .from("plans")
    .select("*")
    .eq("id", planId)
    .single();
  if (error) {
    console.error("[DB] getPlanById failed:", error.message);
    return null;
  }
  return mapPlan(data as PlanRow);
}

export async function getTasksByPlanId(planId: string): Promise<Task[]> {
  const { data, error } = await getDb()
    .from("tasks")
    .select("*")
    .eq("plan_id", planId)
    .order("start_time", { ascending: true });
  if (error) {
    console.error("[DB] getTasksByPlanId failed:", error.message);
    return [];
  }
  return (data as TaskRow[]).map(mapTask);
}

export async function getLatestActiveSession(): Promise<Session | null> {
  const { data, error } = await getDb()
    .from("sessions")
    .select("*")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  if (error) {
    console.error("[DB] getLatestActiveSession failed:", error.message);
    return null;
  }
  return mapSession(data as SessionRow);
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export function insertLog(params: {
  sessionId: string;
  planId?: string;
  level: "info" | "warn" | "error" | "replan";
  phase: string;
  message: string;
  payload?: unknown;
}) {
  // fire-and-forget
  getDb().from("system_logs")
    .insert({
      session_id: params.sessionId,
      plan_id: params.planId ?? null,
      level: params.level,
      phase: params.phase,
      message: params.message,
      payload: params.payload ?? null,
    })
    .then(({ error }) => {
      if (error) console.error("[DB] insertLog failed:", error.message);
    });
}
