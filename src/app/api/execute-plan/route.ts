// SSE API Route — /api/execute-plan
// Body: { planId: string }

import { executeConfirmedPlan } from "@/agent/core/agent";
import { getPlanById, getTasksByPlanId } from "@/lib/db/queries";
import { createSSEResponse } from "@/lib/sse/stream";

export async function POST(request: Request) {
  const { planId } = await request.json();

  if (!planId?.trim()) {
    return Response.json({ error: "planId is required" }, { status: 400 });
  }

  const plan = await getPlanById(planId);
  if (!plan) {
    return Response.json({ error: "Plan not found" }, { status: 404 });
  }

  const tasks = await getTasksByPlanId(planId);
  if (tasks.length === 0) {
    return Response.json({ error: "Plan has no tasks" }, { status: 400 });
  }

  return createSSEResponse(async (emitter) => {
    await executeConfirmedPlan({ ...plan, tasks }, emitter);
  });
}
