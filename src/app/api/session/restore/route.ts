// 会话状态恢复 API
// GET /api/session/restore
// 返回当前 active 状态的 session 及其关联的 plan、tasks

import { getLatestActiveSession, getPlanById, getTasksByPlanId } from "@/lib/db/queries";

export async function GET() {
  try {
    // 1. 查找最近 active 的 session
    const session = await getLatestActiveSession();

    if (!session) {
      return Response.json({
        session: null,
        plan: null,
        tasks: [],
        message: "No active session found",
      });
    }

    // 2. 获取 session 关联的 plan
    const plan = session.currentPlanId
      ? await getPlanById(session.currentPlanId)
      : null;

    if (!plan) {
      return Response.json({
        session,
        plan: null,
        tasks: [],
        message: "No plan found for this session",
      });
    }

    // 3. 获取 plan 的任务列表
    const tasks = await getTasksByPlanId(plan.id);

    // 4. 返回完整状态
    return Response.json({
      session: {
        id: session.id,
        status: session.status,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      plan: {
        ...plan,
        tasks, // 内联 tasks 方便前端使用
      },
      tasks,
      message: "Session restored successfully",
    });
  } catch (err) {
    console.error("[SessionRestore] Error:", err);
    return Response.json(
      { error: "Failed to restore session" },
      { status: 500 }
    );
  }
}
