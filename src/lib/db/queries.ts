import { db } from "./supabase";
import type { Plan, Task, ExecutionResult, Session } from "@/types";

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
  const { error } = await db.from("sessions").upsert(row);
  if (error) console.error("[DB] upsertSession failed:", error.message);
}

// ── Plans ─────────────────────────────────────────────────────────────────────

export async function upsertPlan(plan: Plan) {
  const { error } = await db.from("plans").upsert({
    id: plan.id,
    session_id: plan.sessionId,
    intent: plan.intent,
    status: plan.status,
    constraint_level: plan.constraintLevel,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("[DB] upsertPlan failed:", error.message);
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function upsertTasks(tasks: Task[]) {
  if (tasks.length === 0) return;
  const rows = tasks.map((t) => ({
    id: t.id,
    plan_id: t.planId,
    type: t.type,
    business_type: t.businessType,
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
    updated_at: new Date().toISOString(),
  }));
  const { error } = await db.from("tasks").upsert(rows);
  if (error) console.error("[DB] upsertTasks failed:", error.message);
}

// ── Executions ────────────────────────────────────────────────────────────────

export async function insertExecution(result: ExecutionResult, planId: string) {
  const { error } = await db.from("executions").insert({
    task_id: result.taskId,
    plan_id: planId,
    success: result.success,
    merchant: result.merchant,
    failure_reason: result.failureReason ?? null,
    executed_at: result.executedAt,
  });
  if (error) console.error("[DB] insertExecution failed:", error.message);
}

// ── User Memory (Agent Memory) ────────────────────────────────────────────────

export interface UserMemory {
  id: string;
  memoryMd: string;
  summary: string;
}

export async function getUserMemory(userId: string): Promise<UserMemory | null> {
  const { data, error } = await db
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) {
    if (error.code !== "PGRST116") console.error("[DB] getUserMemory failed:", error.message);
    return null;
  }
  return {
    id: data.id,
    memoryMd: data.memory_md ?? "",
    summary: data.summary ?? "",
  };
}

export async function upsertUserMemory(memory: UserMemory) {
  const { error } = await db.from("user_profiles").upsert({
    id: memory.id,
    memory_md: memory.memoryMd,
    summary: memory.summary,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("[DB] upsertUserMemory failed:", error.message);
}

// ── Queries ────────────────────────────────────────────────────────────────────

export async function getTaskById(taskId: string): Promise<Task | null> {
  const { data, error } = await db
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .single();
  if (error) {
    console.error("[DB] getTaskById failed:", error.message);
    return null;
  }
  return data as Task;
}

export async function getPlanById(planId: string): Promise<Plan | null> {
  const { data, error } = await db
    .from("plans")
    .select("*")
    .eq("id", planId)
    .single();
  if (error) {
    console.error("[DB] getPlanById failed:", error.message);
    return null;
  }
  return data as Plan;
}

export async function getTasksByPlanId(planId: string): Promise<Task[]> {
  const { data, error } = await db
    .from("tasks")
    .select("*")
    .eq("plan_id", planId)
    .order("start_time", { ascending: true });
  if (error) {
    console.error("[DB] getTasksByPlanId failed:", error.message);
    return [];
  }
  return data as Task[];
}

export async function getLatestActiveSession(): Promise<Session | null> {
  const { data, error } = await db
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
  return data as Session;
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
  db.from("system_logs")
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
