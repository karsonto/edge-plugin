import { useEffect, useMemo, useState } from 'react';
import { Download, History, Play, Square, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import type { AutomationStepLog } from '@/shared/types';
import { useAutomation } from '@/sidepanel/hooks/useAutomation';

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'running'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : status === 'waiting_confirmation'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : status === 'done'
          ? 'bg-green-50 text-green-700 border-green-200'
          : status === 'failed'
            ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-gray-50 text-gray-700 border-gray-200';

  const label =
    status === 'running'
      ? '运行中'
      : status === 'waiting_confirmation'
        ? '待确认'
        : status === 'done'
          ? '已完成'
          : status === 'failed'
            ? '失败'
            : status === 'stopped'
              ? '已停止'
              : '空闲';

  return <span className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

function StepRow({ step }: { step: AutomationStepLog }) {
  const [open, setOpen] = useState(false);
  const statusCls =
    step.status === 'completed'
      ? 'text-green-700'
      : step.status === 'failed'
        ? 'text-red-700'
        : step.status === 'waiting_confirmation'
          ? 'text-amber-700'
          : step.status === 'cancelled'
            ? 'text-gray-500'
            : 'text-gray-700';

  return (
    <div className="border border-gray-200 rounded-lg p-2 bg-white">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="text-left flex-1 min-w-0"
          title="展开/收起步骤详情"
        >
          <div className="text-xs text-gray-700 truncate">
            <span className="font-semibold">{step.tool}</span>
            {step.args ? <span className="text-gray-400"> · {JSON.stringify(step.args).slice(0, 120)}</span> : null}
          </div>
        </button>
        <div className={`text-xs whitespace-nowrap ${statusCls}`}>{step.status}</div>
      </div>
      {(step.attempts && step.attempts > 1) || step.locatorUsed ? (
        <div className="mt-1 text-[11px] text-gray-500 flex gap-2">
          {step.attempts && step.attempts > 1 ? <span>重试 {step.attempts} 次</span> : null}
          {step.locatorUsed ? <span>定位：{step.locatorUsed}</span> : null}
        </div>
      ) : null}
      {step.result?.error && (
        <div className="mt-1 text-xs text-red-600 break-words">{step.result.error}</div>
      )}
      {step.result?.requiresConfirmation && step.result.confirmationMessage && (
        <div className="mt-1 text-xs text-amber-700 break-words">{step.result.confirmationMessage}</div>
      )}
      {open && (
        <pre className="mt-2 text-[11px] leading-relaxed bg-gray-50 border border-gray-200 rounded-lg p-2 overflow-auto max-h-40">
{JSON.stringify(step, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function AutomationPanel({
  includePageContext,
  pageContextText,
}: {
  includePageContext: boolean;
  pageContextText?: string;
}) {
  const { run, history, pendingConfirmation, isStarting, error, start, stop, confirm, loadHistory, clearError } = useAutomation();
  const [goal, setGoal] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const status = run?.status || 'idle';
  const steps = run?.steps || [];
  const lastSteps = useMemo(() => steps.slice(-6), [steps]);
  const displayedSteps = useMemo(
    () => (showAllSteps ? steps : lastSteps),
    [showAllSteps, steps, lastSteps]
  );

  const canStart = !isStarting && status !== 'running' && status !== 'waiting_confirmation';

  const handleStart = async () => {
    const ctx = includePageContext ? pageContextText : undefined;
    await start(goal, ctx);
    setExpanded(true);
  };

  useEffect(() => {
    if (expanded) loadHistory();
  }, [expanded, loadHistory]);

  const handleExport = () => {
    if (!run) return;
    const safe = {
      runId: run.runId,
      tabId: run.tabId,
      goal: run.goal,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      error: run.error,
      finalAnswer: run.finalAnswer,
      steps: run.steps.map((s) => {
        const args = s.args ? { ...s.args } : undefined;
        if (args && typeof (args as any).text === 'string') {
          (args as any).text = `__redacted__(${(args as any).text.length})`;
        }
        return { ...s, args };
      }),
    };
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `automation-log-${run.runId}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      {/* Panel */}
      <div className="mx-5 mt-3 mb-2 border border-gray-200 rounded-xl bg-white">
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">自动化</span>
            <StatusBadge status={status} />
            {run?.runId && <span className="text-xs text-gray-400 truncate">#{run.runId.slice(-6)}</span>}
          </div>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 whitespace-nowrap"
          >
            {expanded ? (
              <>
                收起 <ChevronUp size={14} />
              </>
            ) : (
              <>
                展开 <ChevronDown size={14} />
              </>
            )}
          </button>
        </div>

        <div className="px-3 pb-3">
          <div className="flex gap-2 items-center">
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="输入自动化目标（例如：选择今天日期并点击查询）"
              disabled={!canStart}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary disabled:bg-gray-50"
            />

            {status === 'running' || status === 'waiting_confirmation' ? (
              <button
                type="button"
                onClick={stop}
                className="h-10 px-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm flex items-center gap-2"
                title="停止自动化"
              >
                <Square size={16} /> 停止
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStart}
                disabled={!goal.trim() || !canStart}
                className="h-10 px-3 rounded-lg bg-primary hover:bg-primary-dark text-white text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="开始自动化"
              >
                <Play size={16} /> 运行
              </button>
            )}

            <button
              type="button"
              onClick={handleExport}
              disabled={!run || run.steps.length === 0}
              className="h-10 px-3 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title="导出运行日志（JSON，脱敏）"
            >
              <Download size={16} /> 导出
            </button>

            <button
              type="button"
              onClick={() => setShowHistory(v => !v)}
              className="h-10 px-3 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 text-sm flex items-center gap-2"
              title="查看历史记录"
            >
              <History size={16} /> 历史
            </button>
          </div>

          {showHistory && (
            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-600">最近 {Math.min(history.length, 10)} 条</div>
                <button className="text-xs text-primary" onClick={loadHistory}>刷新</button>
              </div>
              <div className="mt-2 space-y-1 max-h-40 overflow-auto pr-1">
                {history.slice(0, 10).map((h) => (
                  <div key={h.runId} className="text-xs text-gray-700 flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate">
                      <span className="text-gray-400">#{h.runId.slice(-6)}</span> · {h.status} · {h.goal}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        className="text-xs text-primary hover:text-primary-dark whitespace-nowrap"
                        onClick={() => setGoal(h.goal)}
                        title="将该目标填入输入框"
                      >
                        复用
                      </button>
                      <button
                        type="button"
                        className="text-xs text-primary hover:text-primary-dark whitespace-nowrap"
                        onClick={() => {
                          setGoal(h.goal);
                          void start(h.goal, includePageContext ? pageContextText : undefined);
                          setExpanded(true);
                        }}
                        title="使用相同目标立即重跑（新的 run）"
                      >
                        重跑
                      </button>
                    </div>
                  </div>
                ))}
                {history.length === 0 && <div className="text-xs text-gray-400">暂无历史</div>}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-xs flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5" />
              <div className="flex-1 break-words">{error}</div>
              <button className="text-red-700/80 hover:text-red-900" onClick={clearError}>
                关闭
              </button>
            </div>
          )}

          {expanded && (
            <div className="mt-3 space-y-2">
              {status === 'done' && run?.finalAnswer && (
                <div className="rounded-lg border border-green-200 bg-green-50 text-green-800 px-3 py-2 text-xs whitespace-pre-wrap">
                  {run.finalAnswer}
                </div>
              )}
              {status === 'failed' && run?.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-xs whitespace-pre-wrap">
                  {run.error}
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  {showAllSteps ? `全部步骤（${steps.length}）` : '最近步骤（最多 6 条）'}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllSteps(v => !v)}
                  className="text-xs text-primary hover:text-primary-dark"
                >
                  {showAllSteps ? '只看最近' : '查看全部'}
                </button>
              </div>

              {displayedSteps.length === 0 ? (
                <div className="text-xs text-gray-400">暂无步骤</div>
              ) : (
                <div className={showAllSteps ? 'space-y-2 max-h-64 overflow-auto pr-1' : 'space-y-2'}>
                  {displayedSteps.map((s) => <StepRow key={s.stepId} step={s} />)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {pendingConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
          <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 shadow-lg">
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="text-sm font-semibold text-gray-900">{pendingConfirmation.title}</div>
              <div className="text-xs text-gray-500 mt-1">工具：{pendingConfirmation.tool}</div>
            </div>
            <div className="px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap">
              {pendingConfirmation.description || '该操作可能有风险，是否继续？'}
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => confirm(false)}
                className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => confirm(true)}
                className="px-3 py-2 text-sm rounded-lg bg-primary hover:bg-primary-dark text-white"
              >
                继续
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


