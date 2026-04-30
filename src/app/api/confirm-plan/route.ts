// 用户确认方案 API
// POST /api/confirm-plan
// Body: { planId: string, sessionId: string, confirmed: boolean, adjustments?: [...] }

import { getPlanById, upsertPlan, getTasksByPlanId, upsertTasks } from "@/lib/db/queries";
import type { Merchant, Task } from "@/types";

type PlanAdjustment =
  | {
      type: "replace_merchant";
      taskId: string;
      newMerchant: Merchant;
    }
  | {
      type: "adjust_time";
      taskId: string;
      newTime: {
        startTime: string;
        endTime: string;
      };
    };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { planId, sessionId, confirmed, adjustments } = body;

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
      // 用户取消或选择微调
      // 更新 plan 状态为 cancelled 或 awaiting_adjustment
      await upsertPlan({ ...plan, status: "cancelled" });
      return Response.json({
        success: true,
        status: "cancelled",
        message: "Plan cancelled, awaiting user adjustments",
      });
    }

    // 用户确认执行
    // 如果有微调请求，先应用调整
    let finalPlan = plan;
    if (adjustments && adjustments.length > 0) {
      const tasks = await getTasksByPlanId(planId);
      const updatedTasks = applyAdjustments(tasks, adjustments);
      await upsertTasks(updatedTasks);
      finalPlan = { ...plan, tasks: updatedTasks };
    }

    // 更新 plan 状态为 ready，等待执行
    await upsertPlan({ ...finalPlan, status: "ready" });

    return Response.json({
      success: true,
      status: "confirmed",
      message: "Plan confirmed, ready for execution",
      plan: finalPlan,
    });
  } catch (err) {
    console.error("[ConfirmPlan] Error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// 应用用户微调
function applyAdjustments(tasks: Task[], adjustments: PlanAdjustment[]): Task[] {
  const updated = [...tasks];

  for (const adj of adjustments) {
    const idx = updated.findIndex((t) => t.id === adj.taskId);
    if (idx === -1) continue;

    if (adj.type === "replace_merchant" && adj.newMerchant) {
      updated[idx] = {
        ...updated[idx],
        merchant: adj.newMerchant,
        replacedFrom: updated[idx].merchant?.id || null,
      };
    }

    if (adj.type === "adjust_time" && adj.newTime) {
      updated[idx] = {
        ...updated[idx],
        startTime: adj.newTime.startTime,
        endTime: adj.newTime.endTime,
      };
    }
  }

  return updated;
}
