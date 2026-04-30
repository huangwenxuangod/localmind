// 用户确认方案 API
// POST /api/confirm-plan
// Body: { planId: string, sessionId: string, confirmed: boolean }

import { getPlanById, upsertPlan } from "@/lib/db/queries";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { planId, sessionId, confirmed } = body;

    if (!planId || !sessionId || typeof confirmed !== "boolean") {
      return Response.json(
        { error: "Missing required fields: planId, sessionId, confirmed" },
        { status: 400 }
      );
    }

    // 获取当前 plan
    const plan = await getPlanById(planId);
    if (!plan) {
      return Response.json({ error: "Plan not found" }, { status: 404 });
    }

    if (!confirmed) {
      await upsertPlan({ ...plan, status: "cancelled" });
      return Response.json({
        success: true,
        status: "cancelled",
        message: "Plan cancelled, awaiting user adjustments",
      });
    }

    await upsertPlan({ ...plan, status: "ready" });

    return Response.json({
      success: true,
      status: "confirmed",
      message: "Plan confirmed, ready for execution",
      plan,
    });
  } catch (err) {
    console.error("[ConfirmPlan] Error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
