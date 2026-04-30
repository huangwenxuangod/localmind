"use client";
import { useState, useRef, useEffect } from "react";
import type { SSEEvent, Plan, Task, TaskUpdatePayload } from "@/types";

type PhaseLabel = {
  [key: string]: string;
};

const PHASE_LABELS: PhaseLabel = {
  parsing_start: "🧠 正在解析行程需求...",
  parsing_done: "✅ 需求解析完成",
  planning_start: "📅 正在规划行程方案...",
  planning_done: "✅ 行程方案生成完成",
  validation_start: "🔍 正在预校验商家...",
  validation_done: "✅ 预校验完成",
  plan_ready: "🎯 方案就绪，等待确认",
  execution_start: "🚀 并行执行所有任务...",
  replanning_start: "♻️ 触发梯度重排...",
  replanning_done: "✅ 重排方案已更新",
  execution_complete: "🎉 行程履约全部完成！",
  error: "❌ 发生错误",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-500",
  validating: "bg-blue-50 text-blue-600",
  ready: "bg-blue-100 text-blue-700",
  executing: "bg-yellow-50 text-yellow-600",
  success: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-600",
  replaced: "bg-purple-100 text-purple-700",
  replanning: "bg-orange-100 text-orange-600",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "待执行",
  validating: "校验中",
  ready: "就绪",
  executing: "执行中",
  success: "✓ 完成",
  failed: "✗ 失败",
  replaced: "↩ 已替换",
  replanning: "重排中",
};

const TYPE_ICONS: Record<string, string> = {
  restaurant: "🍽️",
  cafe: "☕",
  shopping: "🛍️",
  entertainment: "🎮",
  leisure: "🌸",
  sport: "🏃",
  culture: "🏛️",
};

const EXAMPLE_INPUTS = [
  "明天下午2点到6点，在西湖附近，我和朋友2个人想逛街吃晚饭，不吃辣",
  "今天上午10点出发，一家三口亲子游，想吃饭+逛商场+看电影，开车出行",
  "下午3点到8点，情侣约会，想喝下午茶+晚饭+密室逃脱，预算中等",
];

export default function HomePage() {
  const [input, setInput] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [running, setRunning] = useState(false);
  const [finalPlan, setFinalPlan] = useState<Plan | null>(null);
  const [confirmingPlan, setConfirmingPlan] = useState<Plan | null>(null);
  const [restoring, setRestoring] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const appendLog = (msg: string) => {
    setLogs((prev) => [...prev, msg]);
  };

  const consumeSSE = async (res: Response) => {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response stream");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event: SSEEvent = JSON.parse(line.slice(6));
          handleEvent(event);
        } catch {
          // ignore parse errors
        }
      }
    }
  };

  // 会话状态恢复
  useEffect(() => {
    async function restoreSession() {
      try {
        setRestoring(true);
        const res = await fetch("/api/session/restore");
        const data = await res.json();

        if (data.session && data.plan) {
          setInput(data.plan.intent.rawInput);
          setTasks(data.tasks);
          setFinalPlan(data.plan);

          // 如果方案是 ready 状态，显示确认面板
          if (data.plan.status === "ready") {
            setConfirmingPlan(data.plan);
          }

          appendLog(`已恢复 ${new Date(data.session.updatedAt).toLocaleString()} 的未完成行程`);
        }
      } catch (err) {
        console.error("恢复会话失败:", err);
      } finally {
        setRestoring(false);
      }
    }

    restoreSession();
  }, []);

  const handleRun = async () => {
    if (!input.trim() || running) return;
    setRunning(true);
    setLogs([]);
    setTasks([]);
    setFinalPlan(null);
    setConfirmingPlan(null);

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userInput: input }),
        signal: abortRef.current.signal,
      });

      await consumeSSE(res);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        appendLog(`❌ 连接错误: ${err.message}`);
      }
    } finally {
      setRunning(false);
    }
  };

  const handleEvent = (event: SSEEvent) => {
    const label = PHASE_LABELS[event.type];
    if (label) appendLog(`[${new Date(event.timestamp).toLocaleTimeString()}] ${label}`);

    if (event.type === "planning_done" || event.type === "plan_ready" || event.type === "replanning_done") {
      const plan = (event.payload as { plan: Plan }).plan;
      if (plan?.tasks) setTasks(plan.tasks);
    }

    // 方案就绪，等待用户确认
    if (event.type === "plan_ready") {
      const plan = (event.payload as { plan: Plan }).plan;
      setConfirmingPlan(plan);
      setRunning(false);
    }

    if (event.type === "task_update" || event.type === "task_replaced") {
      const p = event.payload as TaskUpdatePayload;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === p.taskId
            ? {
                ...t,
                status: p.status,
                merchant: p.merchant ?? t.merchant,
                failureReason: p.failureReason ?? t.failureReason,
                retryCount: p.retryCount ?? t.retryCount,
              }
            : t
        )
      );
    }

    if (event.type === "execution_complete") {
      const plan = (event.payload as { plan: Plan }).plan;
      setFinalPlan(plan);
      setRunning(false);
    }

    if (event.type === "error") {
      const { message } = event.payload as { message: string };
      appendLog(`❌ ${message}`);
      setRunning(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
    appendLog("⏹️ 已手动终止执行");
  };

  // 确认方案并继续执行
  const handleConfirmPlan = async (confirmed: boolean) => {
    if (!confirmingPlan) return;

    if (!confirmed) {
      // 用户选择微调，关闭确认面板
      setConfirmingPlan(null);
      appendLog("用户选择微调方案");
      return;
    }

    // 用户确认执行
    try {
      const res = await fetch("/api/confirm-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: confirmingPlan.id,
          sessionId: confirmingPlan.sessionId,
          confirmed: true,
        }),
      });

      if (res.ok) {
        setConfirmingPlan(null);
        setRunning(true);
        appendLog("用户确认方案，开始执行...");

        const execRes = await fetch("/api/execute-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: confirmingPlan.id }),
        });

        if (!execRes.ok) {
          const error = await execRes.json();
          appendLog(`执行失败: ${error.error}`);
          setRunning(false);
          return;
        }

        await consumeSSE(execRes);
      } else {
        const error = await res.json();
        appendLog(`确认失败: ${error.error}`);
      }
    } catch (err) {
      appendLog(`确认异常: ${err}`);
    } finally {
      setRunning(false);
    }
  };

  // 替换任务商家
  const handleReplaceTask = async (taskId: string) => {
    if (!finalPlan && !confirmingPlan) return;
    const plan = confirmingPlan || finalPlan;
    if (!plan) return;

    try {
      const res = await fetch("/api/replace-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          planId: plan.id,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // 更新本地任务状态
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, ...data.task } : t))
        );
        appendLog(`任务已替换为: ${data.task.merchant?.name}`);
      } else {
        const error = await res.json();
        appendLog(`替换失败: ${error.error}`);
      }
    } catch (err) {
      appendLog(`替换异常: ${err}`);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center pt-4">
          <h1 className="text-3xl font-bold text-slate-800">🗺️ AI同城行程规划</h1>
          <p className="text-slate-500 mt-1 text-sm">MiniClaw · 单Agent · 全自动履约</p>
          {restoring && (
            <p className="text-blue-500 mt-2 text-sm animate-pulse">⏳ 正在恢复上次会话...</p>
          )}
        </div>

        {/* Plan Confirmation Panel */}
        {confirmingPlan && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
              <h3 className="text-xl font-bold mb-4">方案已生成，请确认</h3>

              {/* 行程摘要 */}
              <div className="space-y-3 mb-6">
                {confirmingPlan.tasks.map((t: Task, i: number) => (
                  <div key={t.id} className="flex items-center gap-3 text-sm border-b border-slate-100 pb-2">
                    <span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium text-xs">
                      {i + 1}
                    </span>
                    <span className="flex-1 font-medium">{t.merchant?.name || `待定${t.businessType}`}</span>
                    <span className="text-slate-400 text-xs">
                      {new Date(t.startTime).toLocaleTimeString("zh", { hour: "2-digit", minute: "2-digit" })}
                      -
                      {new Date(t.endTime).toLocaleTimeString("zh", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {confirmingPlan && (
                      <button
                        onClick={() => handleReplaceTask(t.id)}
                        className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded"
                      >
                        换一家
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3">
                <button
                  onClick={() => handleConfirmPlan(true)}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors"
                >
                  ✅ 确认执行
                </button>
                <button
                  onClick={() => handleConfirmPlan(false)}
                  className="px-4 py-3 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  微调
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="描述你的出行需求，例如：今天下午2点到6点，在西湖附近，2个人吃饭逛街..."
            rows={3}
            disabled={running || restoring}
            className="w-full resize-none rounded-xl border border-slate-200 p-3 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm disabled:opacity-60"
          />

          {/* Example chips */}
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_INPUTS.map((ex, i) => (
              <button
                key={i}
                onClick={() => setInput(ex)}
                disabled={running || restoring}
                className="text-xs bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
              >
                示例{i + 1}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleRun}
              disabled={running || restoring || !input.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
            >
              {restoring ? "恢复中..." : running ? "规划执行中..." : "🚀 开始规划"}
            </button>
            {running && (
              <button
                onClick={handleStop}
                className="px-4 bg-red-50 hover:bg-red-100 text-red-600 font-medium py-2.5 rounded-xl transition-colors text-sm border border-red-200"
              >
                终止
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Task Timeline */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-700 mb-4 text-sm uppercase tracking-wide">
              📋 行程任务
            </h2>
            {tasks.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">行程任务将在规划后显示</p>
            ) : (
              <div className="space-y-3">
                {tasks.map((task, i) => (
                  <div key={task.id} className="relative">
                    {i < tasks.length - 1 && (
                      <div className="absolute left-5 top-10 w-0.5 h-4 bg-slate-200" />
                    )}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-lg flex-shrink-0">
                        {TYPE_ICONS[task.businessType] ?? "📌"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-800 text-sm truncate">
                            {task.merchant?.name ?? `待定${task.businessType}`}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[task.status]}`}>
                            {STATUS_LABELS[task.status]}
                          </span>
                          {task.type === "core" && (
                            <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-200">核心</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {new Date(task.startTime).toLocaleTimeString("zh", { hour: "2-digit", minute: "2-digit" })}
                          {" → "}
                          {new Date(task.endTime).toLocaleTimeString("zh", { hour: "2-digit", minute: "2-digit" })}
                          {task.merchant?.address && (
                            <span className="ml-2 text-slate-300">· {task.merchant.address.slice(0, 12)}</span>
                          )}
                        </div>
                        {task.failureReason && (
                          <p className="text-xs text-red-400 mt-0.5">{task.failureReason}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Execution Log */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col">
            <h2 className="font-semibold text-slate-700 mb-4 text-sm uppercase tracking-wide">
              📡 执行日志
            </h2>
            <div className="flex-1 overflow-y-auto max-h-80 space-y-1.5">
              {logs.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">等待执行...</p>
              ) : (
                logs.map((log, i) => (
                  <p key={i} className="text-xs text-slate-600 font-mono leading-relaxed">
                    {log}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Final Summary */}
        {finalPlan && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
            <h2 className="font-semibold text-green-800 mb-3">🎉 行程履约完成</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-slate-800">{finalPlan.tasks.length}</p>
                <p className="text-xs text-slate-500 mt-1">总任务数</p>
              </div>
              <div className="bg-white rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-green-600">
                  {finalPlan.tasks.filter((t) => t.status === "success" || t.status === "replaced").length}
                </p>
                <p className="text-xs text-slate-500 mt-1">成功执行</p>
              </div>
              <div className="bg-white rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {finalPlan.tasks.filter((t) => t.status === "replaced").length}
                </p>
                <p className="text-xs text-slate-500 mt-1">自动替换</p>
              </div>
              <div className="bg-white rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-orange-600">{finalPlan.constraintLevel}</p>
                <p className="text-xs text-slate-500 mt-1">约束降级层</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
