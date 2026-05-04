"use client";

import { useEffect, useRef, useState } from "react";
import type { Plan, PlanValidationItem, SSEEvent, Task, TaskUpdatePayload } from "@/types";

const EXAMPLE_INPUTS = [
  "周六上午 9 点，小明迎来了难得周末双休，他给美团发了一条消息：今天下午是空的，想和老婆孩子出去玩几个小时，别离家太远，帮我安排一下。家庭场景：孩子 5 岁，老婆最近在减肥",
  "明天下午2点到6点，在西湖附近，我和朋友2个人想逛街吃晚饭，不吃辣",
  "今天下午是空的，想带孩子在家附近轻松玩一下，最好别太累，顺便吃点清淡的",
];

const STATUS_LABEL: Record<string, string> = {
  pending: "待确认",
  ready: "已校验",
  executing: "执行中",
  success: "已执行",
  failed: "失败",
  replaced: "已替换",
  validating: "校验中",
  replanning: "重排中",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function validationClass(status: PlanValidationItem["status"]) {
  if (status === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "warn") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

export default function HomePage() {
  const [input, setInput] = useState(EXAMPLE_INPUTS[0]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const appendLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
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
        const event = JSON.parse(line.slice(6)) as SSEEvent;
        handleEvent(event);
      }
    }
  };

  useEffect(() => {
    async function restoreSession() {
      try {
        setRestoring(true);
        const res = await fetch("/api/session/restore");
        const data = await res.json();
        if (data.session && data.plan) {
          setPlan(data.plan);
          setInput(data.plan.intent.rawInput);
          appendLog("已恢复最近未完成方案");
        }
      } catch {
        appendLog("未恢复到可用会话");
      } finally {
        setRestoring(false);
      }
    }

    restoreSession();
  }, []);

  const handleEvent = (event: SSEEvent) => {
    if (event.type === "parsing_start") appendLog("正在理解长文本场景");
    if (event.type === "parsing_done") appendLog("已提取出行目标、参与人和偏好");
    if (event.type === "planning_start") appendLog("正在生成可执行行程");
    if (event.type === "planning_done") {
      const nextPlan = (event.payload as { plan: Plan }).plan;
      setPlan(nextPlan);
      appendLog("已生成行程卡");
    }
    if (event.type === "validation_done") appendLog("可执行性校验完成");
    if (event.type === "plan_ready") {
      const nextPlan = (event.payload as { plan: Plan }).plan;
      setPlan(nextPlan);
      appendLog("方案已保存，等待确认");
      setRunning(false);
    }
    if (event.type === "execution_start") appendLog("开始 mock 履约执行");
    if (event.type === "task_update" || event.type === "task_replaced") {
      const payload = event.payload as TaskUpdatePayload;
      setPlan((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  status: payload.status,
                  merchant: payload.merchant ?? task.merchant,
                  title: payload.merchant?.name ?? task.title,
                  failureReason: payload.failureReason ?? task.failureReason,
                  retryCount: payload.retryCount ?? task.retryCount,
                }
              : task
          ),
        };
      });
    }
    if (event.type === "execution_complete") {
      const nextPlan = (event.payload as { plan: Plan }).plan;
      setPlan(nextPlan);
      appendLog("mock 履约完成");
      setRunning(false);
    }
    if (event.type === "error") {
      const payload = event.payload as { message: string };
      setError(payload.message);
      appendLog(payload.message);
      setRunning(false);
    }
  };

  const handlePlan = async () => {
    if (!input.trim() || running) return;
    setRunning(true);
    setError(null);
    setPlan(null);
    setLogs([]);
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userInput: input }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "规划失败");
      }

      await consumeSSE(res);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message);
        appendLog(err.message);
      }
    } finally {
      setRunning(false);
    }
  };

  const handleConfirm = async () => {
    if (!plan || running) return;
    setRunning(true);
    setError(null);

    try {
      const confirmRes = await fetch("/api/confirm-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, sessionId: plan.sessionId, confirmed: true }),
      });

      if (!confirmRes.ok) {
        const data = await confirmRes.json();
        throw new Error(data.error ?? "确认失败");
      }

      const execRes = await fetch("/api/execute-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });

      if (!execRes.ok) {
        const data = await execRes.json();
        throw new Error(data.error ?? "执行失败");
      }

      await consumeSSE(execRes);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      appendLog(message);
    } finally {
      setRunning(false);
    }
  };

  const handleReplace = async (taskId: string) => {
    if (!plan || running) return;
    setRunning(true);
    setError(null);

    try {
      const res = await fetch("/api/replace-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, taskId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "替换失败");

      setPlan((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((task) => (task.id === taskId ? data.task : task)),
          validation: data.validation ?? prev.validation,
        };
      });
      appendLog(data.message ?? "已替换并重新校验");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      appendLog(message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8">
        <header className="flex flex-col gap-1">
          <p className="text-sm font-medium text-blue-700">MiniClaw Agent Demo</p>
          <h1 className="text-3xl font-bold tracking-normal">美团同城行程规划</h1>
          <p className="text-sm text-slate-500">长文本场景理解、行程卡生成、可执行性校验、mock 履约闭环</p>
        </header>

        <section className="grid gap-5 lg:grid-cols-[420px_1fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <label className="text-sm font-semibold text-slate-700">用户长文本</label>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={running || restoring}
              rows={9}
              className="mt-3 w-full resize-none rounded-md border border-slate-200 p-3 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLE_INPUTS.map((example, index) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setInput(example)}
                  disabled={running}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"
                >
                  示例 {index + 1}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handlePlan}
              disabled={running || restoring || !input.trim()}
              className="mt-4 w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
            >
              {running ? "处理中..." : restoring ? "恢复中..." : "生成可执行行程"}
            </button>
            {error && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-5">
            {!plan ? (
              <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-400">
                生成后这里会展示行程卡、推荐理由和可执行性校验
              </div>
            ) : (
              <>
                <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                      <p className="text-sm font-medium text-blue-700">
                        {plan.brief?.city}{plan.brief?.area}
                        {plan.plannerSource && (
                          <span className="ml-2 rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700">
                            {plan.plannerSource === "llm" ? "LLM 草稿 + 规则校验" : "本地规则兜底"}
                          </span>
                        )}
                      </p>
                      <h2 className="mt-1 text-2xl font-bold">{plan.reasoning?.summary ?? "推荐行程"}</h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{plan.brief?.userGoal}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleConfirm}
                      disabled={running}
                      className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-300"
                    >
                      确认并 mock 履约
                    </button>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <InfoBlock title="时间窗口" value={`${formatTime(plan.intent.startTime)}-${formatTime(plan.intent.endTime)}`} />
                    <InfoBlock title="参与人" value={`${plan.brief?.participants.adults ?? 0} 位成人，${plan.brief?.participants.children ?? 0} 位儿童`} />
                    <InfoBlock title="偏好" value={plan.brief?.preferences.join("、") || "通用轻松出行"} />
                    <InfoBlock title="方案评分" value={plan.score ? `${plan.score.total} / 100` : "待计算"} />
                  </div>
                </section>

                <section className="grid gap-4">
                  {plan.tasks.map((task, index) => (
                    <ItineraryCard
                      key={task.id}
                      index={index}
                      task={task}
                      running={running}
                      onReplace={() => handleReplace(task.id)}
                    />
                  ))}
                </section>

                <section className="grid gap-5 lg:grid-cols-2">
                  {plan.score && (
                    <Panel title="方案评分">
                      <div className="mb-4 flex items-end gap-2">
                        <span className="text-4xl font-bold text-slate-900">{plan.score.total}</span>
                        <span className="pb-1 text-sm text-slate-400">/ 100</span>
                      </div>
                      <div className="grid gap-2 text-sm">
                        <ScoreBar label="时间合理" value={plan.score.timeFit} />
                        <ScoreBar label="路线稳定" value={plan.score.routeFit} />
                        <ScoreBar label="偏好匹配" value={plan.score.preferenceFit} />
                        <ScoreBar label="商家可靠" value={plan.score.merchantFit} />
                        <ScoreBar label="节奏轻松" value={plan.score.relaxationFit} />
                      </div>
                      <div className="mt-4 space-y-2 text-sm leading-6 text-slate-600">
                        {plan.score.reasons.map((reason) => <p key={reason}>{reason}</p>)}
                      </div>
                    </Panel>
                  )}

                  <Panel title="可执行性校验">
                    <div className="grid gap-2">
                      {(plan.validation ?? []).map((item) => (
                        <div key={item.label} className={`rounded-md border px-3 py-2 text-sm ${validationClass(item.status)}`}>
                          <div className="font-semibold">{item.label}</div>
                          <div className="mt-1 opacity-90">{item.detail}</div>
                        </div>
                      ))}
                    </div>
                  </Panel>

                  <Panel title="Agent 推理摘要">
                    <div className="space-y-3 text-sm leading-6 text-slate-600">
                      {(plan.brief?.assumptions ?? []).map((item) => (
                        <p key={item} className="rounded-md bg-blue-50 p-3 text-blue-800">{item}</p>
                      ))}
                      {(plan.reasoning?.whyThisWorks ?? []).map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                      {(plan.reasoning?.hiddenInsights ?? []).map((item) => (
                        <p key={item} className="rounded-md bg-slate-50 p-3 text-slate-700">{item}</p>
                      ))}
                    </div>
                  </Panel>
                </section>
              </>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 text-sm font-semibold text-slate-700">运行日志</div>
          <div className="max-h-44 space-y-1 overflow-y-auto font-mono text-xs leading-5 text-slate-500">
            {logs.length ? logs.map((log) => <div key={log}>{log}</div>) : <div>等待执行...</div>}
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      <div className="mt-1 text-sm font-medium text-slate-700">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-bold text-slate-800">{title}</h3>
      {children}
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-medium text-slate-500">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function ItineraryCard({
  index,
  task,
  running,
  onReplace,
}: {
  index: number;
  task: Task;
  running: boolean;
  onReplace: () => void;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-50 text-sm font-bold text-blue-700">
            {index + 1}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold">{task.title ?? task.merchant?.name ?? task.businessType}</h3>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                {STATUS_LABEL[task.status] ?? task.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {formatTime(task.startTime)}-{formatTime(task.endTime)}
              {task.travelToNextMin > 0 ? ` · 到下一站预留 ${task.travelToNextMin} 分钟` : ""}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{task.whyRecommended}</p>
            {task.merchant?.address && <p className="mt-1 text-sm text-slate-400">{task.merchant.address}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={onReplace}
          disabled={running}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"
        >
          换一家
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(task.suitabilityTags ?? []).map((tag) => (
          <span key={tag} className="rounded-md bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
            {tag}
          </span>
        ))}
      </div>

      {task.validation && task.validation.length > 0 && (
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {task.validation.map((item) => (
            <div key={item.label} className={`rounded-md border px-3 py-2 text-xs ${validationClass(item.status)}`}>
              <div className="font-semibold">{item.label}</div>
              <div className="mt-1">{item.detail}</div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
