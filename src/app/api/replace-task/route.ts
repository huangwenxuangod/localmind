// 替换任务商家 API
// POST /api/replace-task
// Body: { taskId: string, planId: string }

import { getTaskById, getPlanById, getTasksByPlanId, upsertTasks } from "@/lib/db/queries";
import { validateMerchant } from "@/mock/fulfillment";
import { getMerchantsByType } from "@/mock/merchants";
import type { Task } from "@/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { taskId, planId } = body;

    if (!taskId || !planId) {
      return Response.json(
        { error: "Missing required fields: taskId, planId" },
        { status: 400 }
      );
    }

    // 获取任务和方案
    const task = await getTaskById(taskId);
    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    const plan = await getPlanById(planId);
    if (!plan) {
      return Response.json({ error: "Plan not found" }, { status: 404 });
    }

    const headcount = plan.intent.headcount;

    // 从同业态商家中找替代（排除当前商家和已尝试的）
    const currentMerchantId = task.merchant?.id;
    const triedIds = new Set([currentMerchantId, ...(task.replacedFrom ? [task.replacedFrom] : [])]);

    // 优先从候选列表中找未尝试的
    let alternatives = task.candidateMerchants.filter(
      (m) => !triedIds.has(m.id)
    );

    // 候选列表不足时，从同业态商家库补充
    if (alternatives.length < 3) {
      const extras = getMerchantsByType(task.businessType).filter(
        (m) => !triedIds.has(m.id) && !alternatives.find((a) => a.id === m.id)
      );
      alternatives = [...alternatives, ...extras];
    }

    // 逐个校验并尝试替换
    for (const alt of alternatives.slice(0, 5)) {
      const valid = await validateMerchant(
        alt.id,
        task.startTime,
        task.endTime,
        headcount
      );

      if (valid.available) {
        // 更新任务
        const updatedTask: Task = {
          ...task,
          title: alt.name,
          whyRecommended: `已替换为同业态可用地点；${alt.rating.toFixed(1)} 分，仍保持原时间段和路线节奏`,
          suitabilityTags: Array.from(new Set([task.businessType, ...alt.tags.slice(0, 2), ...(plan.brief?.preferences ?? [])])),
          validation: [
            { label: "时间可用", status: "pass", detail: "替换商家通过当前时段可用性校验" },
            { label: "路线影响", status: "pass", detail: "保持同业态与原时间段，不改变后续行程时间" },
          ],
          merchant: alt,
          status: "replaced",
          replacedFrom: currentMerchantId || null,
        };

        await upsertTasks([updatedTask]);
        const tasks = (await getTasksByPlanId(planId)).map((item) =>
          item.id === taskId ? updatedTask : item
        );
        const validation = validatePlanTiming(tasks);

        return Response.json({
          success: true,
          task: updatedTask,
          validation,
          message: `已替换为: ${alt.name}`,
        });
      }
    }

    return Response.json(
      { error: "未找到可用替代商家，建议调整时间或更换业态" },
      { status: 400 }
    );
  } catch (err) {
    console.error("[ReplaceTask] Error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function validatePlanTiming(tasks: Task[]) {
  const sorted = [...tasks].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
  const overlap = sorted.some((task, index) => {
    const next = sorted[index + 1];
    if (!next) return false;
    const currentEndWithTravel = new Date(task.endTime).getTime() + task.travelToNextMin * 60_000;
    return currentEndWithTravel > new Date(next.startTime).getTime();
  });

  return [
    {
      label: "替换后时间校验",
      status: overlap ? "fail" : "pass",
      detail: overlap ? "替换后发现时间或通勤冲突" : "替换后仍无时间重叠，并保留通勤缓冲",
    },
    {
      label: "商家替换",
      status: "pass",
      detail: "只替换当前卡片，不改变其他任务时间",
    },
  ];
}
