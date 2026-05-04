// 替换任务商家 API
// POST /api/replace-task
// Body: { taskId: string, planId: string }

import { getTaskById, getPlanById, getTasksByPlanId, upsertTasks } from "@/lib/db/queries";
import { validateMerchant } from "@/mock/fulfillment";
import {
  DEFAULT_CURRENT_LOCATION,
  LOCAL_LIFE_PLACES,
  estimateRoute,
  getLocalLifePlaceById,
  localPlaceToMerchant,
} from "@/mock/local-life";
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

    // 候选列表不足时，从杭州本地生活 mock 数据补充，避免回到旧商家库
    if (alternatives.length < 3) {
      const extras = LOCAL_LIFE_PLACES
        .filter((place) => {
          const mapped = localPlaceToMerchant(place);
          return mapped.type === task.businessType
            && !triedIds.has(mapped.id)
            && !alternatives.find((a) => a.id === mapped.id);
        })
        .map(localPlaceToMerchant);
      alternatives = [...alternatives, ...extras];
    }

    const checkedAlternatives = await Promise.all(
      alternatives.slice(0, 5).map(async (merchant) => ({
        merchant,
        validation: await validateMerchant(
          merchant.id,
          task.startTime,
          task.endTime,
          headcount
        ),
      }))
    );
    const replacement = checkedAlternatives.find((item) => item.validation.available);

    if (replacement) {
      const alt = replacement.merchant;
      const tasksBeforeUpdate = await getTasksByPlanId(planId);
      const previousTask = [...tasksBeforeUpdate]
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .find((item) => new Date(item.endTime).getTime() <= new Date(task.startTime).getTime() && item.id !== task.id);
      const fromPlace = previousTask?.merchant ? getLocalLifePlaceById(previousTask.merchant.id) : undefined;
      const altPlace = getLocalLifePlaceById(alt.id);
      const route = altPlace
        ? estimateRoute(fromPlace ?? DEFAULT_CURRENT_LOCATION, altPlace, {
            mode: plan.intent.transport,
            familyWithChild: plan.brief?.participants.children ? plan.brief.participants.children > 0 : false,
          })
        : null;
      const updatedTask: Task = {
        ...task,
        title: alt.name,
        whyRecommended: `已替换为同业态可用地点；${alt.rating.toFixed(1)} 分。${route ? route.explanation : "路线为静态估计，需实时确认"}`,
        suitabilityTags: Array.from(new Set([task.businessType, ...alt.tags.slice(0, 2), ...(plan.brief?.preferences ?? [])])),
        validation: [
          { label: "时间可用", status: "pass", detail: "替换商家通过当前时段可用性校验" },
          {
            label: "路线影响",
            status: route && route.frictionLevel <= 3 ? "pass" : "warn",
            detail: route ? route.explanation : "未找到本地生活地点坐标，只能保持原时间段",
          },
          { label: "诚实边界", status: "warn", detail: "换一家仅完成静态校验，实时排队/闭店/施工仍需平台二次确认" },
        ],
        routeFromPrevious: route ? {
          mode: route.mode,
          distanceMeters: route.distanceMeters,
          durationMin: route.durationMin,
          routeShape: route.routeShape,
          frictionLevel: route.frictionLevel,
          childFriendly: route.childFriendly,
          explanation: route.explanation,
        } : task.routeFromPrevious,
        riskNotes: route && route.frictionLevel >= 4 ? ["替换后通勤摩擦升高，建议用户确认是否接受"] : ["替换保持原时间段，需实时确认排队和营业"],
        verification: {
          status: "needs_realtime_check",
          notes: ["已完成静态替换校验", "执行前仍需确认实时营业、排队和路线"],
        },
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
