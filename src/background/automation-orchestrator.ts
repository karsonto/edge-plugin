/**
 * Browser Use (路线A) - Background 自动化编排器
 * 负责：
 * - 调用模型生成 ToolCall / Final
 * - 转发 ToolCall 给 content 执行
 * - 处理高风险确认（提交/下载）
 * - 向 sidepanel 发送状态更新
 */

import type { AIConfig, AutomationRunState, AutomationStepLog, ElementSummary, ToolCall, ToolResult } from '@/shared/types';
import { createMessage } from '@/shared/utils/message-bridge';
import { storageManager } from './storage-manager';
import { AIService } from './ai-service';
import { parseModelJson, toolSpecText, validateToolCall } from './automation-model';

type PendingConfirmation = {
  resolve: (approved: boolean) => void;
  createdAt: number;
};

function now() {
  return Date.now();
}

function genId(prefix: string) {
  return `${prefix}_${now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// parseModelJson/toolSpecText/validateToolCall moved to automation-model.ts

async function sendToContent<T = any>(tabId: number, message: any, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TOOL_RESULT timeout')), timeoutMs);
    chrome.tabs.sendMessage(tabId, message, (resp) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(resp);
      }
    });
  });
}

export class AutomationOrchestrator {
  private runs = new Map<string, AutomationRunState>();
  private pendingConfirmations = new Map<string, PendingConfirmation>(); // key: runId:stepId
  private lastPersistAt = new Map<string, number>();

  getRun(runId: string) {
    return this.runs.get(runId) || null;
  }

  async start(tabId: number, goal: string, context?: string): Promise<string> {
    const runId = genId('run');
    const state: AutomationRunState = {
      runId,
      tabId,
      goal,
      status: 'running',
      createdAt: now(),
      updatedAt: now(),
      steps: [],
    };
    this.runs.set(runId, state);
    this.emitStatus(state);

    // fire and forget loop
    void this.runLoop(runId, context);
    return runId;
  }

  stop(runId: string) {
    const st = this.runs.get(runId);
    if (!st) return;
    st.status = 'stopped';
    st.updatedAt = now();
    this.emitStatus(st);

    // 如果当前 run 正在等待确认，立即拒绝并释放等待，避免死等
    for (const key of this.pendingConfirmations.keys()) {
      if (key.startsWith(`${runId}:`)) {
        const pending = this.pendingConfirmations.get(key);
        if (pending) {
          this.pendingConfirmations.delete(key);
          pending.resolve(false);
        }
      }
    }
  }

  confirm(runId: string, stepId: string, approved: boolean) {
    const key = `${runId}:${stepId}`;
    const pending = this.pendingConfirmations.get(key);
    if (pending) {
      this.pendingConfirmations.delete(key);
      pending.resolve(approved);
    }
  }

  private emitStatus(state: AutomationRunState) {
    chrome.runtime.sendMessage(createMessage('AUTOMATION_STATUS', state));

    // P2: 持久化运行历史（节流 + 终态强制写入）
    const terminal = state.status === 'done' || state.status === 'failed' || state.status === 'stopped';
    const last = this.lastPersistAt.get(state.runId) || 0;
    const n = now();
    if (terminal || n - last >= 1200) {
      this.lastPersistAt.set(state.runId, n);
      void storageManager.saveAutomationRun(this.sanitizeForStorage(state));
    }
  }

  private sanitizeForStorage(state: AutomationRunState): AutomationRunState {
    // 避免把大段可见文本/输入内容写入历史
    const steps = state.steps.map((s) => {
      const args = s.args ? { ...s.args } : undefined;
      if (args && typeof args.text === 'string') {
        args.text = `__redacted__(${args.text.length})`;
      }

      const result = s.result ? { ...s.result } : undefined;
      if (result?.data && typeof (result.data as any).text === 'string') {
        const t = (result.data as any).text as string;
        (result.data as any).text = t.slice(0, 200) + (t.length > 200 ? '…' : '');
        (result.data as any).textLength = t.length;
      }

      return { ...s, args, result };
    });

    return { ...state, steps };
  }

  private pushStep(state: AutomationRunState, step: AutomationStepLog) {
    state.steps = [...state.steps, step];
    state.updatedAt = now();
    this.emitStatus(state);
  }

  private updateStep(state: AutomationRunState, stepId: string, patch: Partial<AutomationStepLog>) {
    state.steps = state.steps.map(s => (s.stepId === stepId ? { ...s, ...patch } : s));
    state.updatedAt = now();
    this.emitStatus(state);
  }

  private async runLoop(runId: string, context?: string) {
    const state = this.runs.get(runId);
    if (!state) return;

    try {
      // 加载 AI 配置
      const cfg = await storageManager.loadConfig();
      const aiConfig: AIConfig = cfg.ai;
      const ai = new AIService(aiConfig);

      // 初始观察：pageInfo + visibleText
      const obsStepId = genId('step');
      this.pushStep(state, {
        stepId: obsStepId,
        tool: 'getPageInfo',
        status: 'running',
        startedAt: now(),
      });

      const pageInfoResp: any = await sendToContent(
        state.tabId,
        createMessage('EXECUTE_TOOL', { runId, stepId: obsStepId, call: { tool: 'getPageInfo' } })
      );
      const pageInfo: ToolResult = pageInfoResp?.payload?.result || pageInfoResp?.result || pageInfoResp?.payload;
      this.updateStep(state, obsStepId, { status: pageInfo?.ok ? 'completed' : 'failed', endedAt: now(), result: pageInfo });

      const textStepId = genId('step');
      this.pushStep(state, {
        stepId: textStepId,
        tool: 'getVisibleText',
        args: { limit: 4000 },
        status: 'running',
        startedAt: now(),
      });
      const textResp: any = await sendToContent(
        state.tabId,
        createMessage('EXECUTE_TOOL', { runId, stepId: textStepId, call: { tool: 'getVisibleText', args: { limit: 4000 } } })
      );
      const visibleText: ToolResult = textResp?.payload?.result || textResp?.result || textResp?.payload;
      this.updateStep(state, textStepId, { status: visibleText?.ok ? 'completed' : 'failed', endedAt: now(), result: visibleText });

      const pageUrl = (pageInfo as any)?.data?.url || '';
      const pageTitle = (pageInfo as any)?.data?.title || '';
      const pageText = (visibleText as any)?.data?.text || '';

      // 主循环
      let scratch: { lastResult?: ToolResult; lastHash?: string; elementIndex: Map<string, ElementSummary> } = {
        elementIndex: new Map(),
      };
      const maxSteps = 25;
      for (let i = 0; i < maxSteps; i++) {
        // stop check
        if (state.status === 'stopped') return;

        const systemPrompt: string[] = [toolSpecText()];
        if (pageUrl || pageTitle) systemPrompt.push(`CurrentPage: ${pageTitle} (${pageUrl})`);
        if (context) systemPrompt.push(`AdditionalContext:\n${context.slice(0, 4000)}`);
        if (pageText) systemPrompt.push(`VisibleTextSnippet:\n${pageText}`);
        if (scratch.lastResult) systemPrompt.push(`LastToolResult:\n${JSON.stringify(scratch.lastResult).slice(0, 2000)}`);

        const modelMessages = [
          { role: 'system' as const, content: systemPrompt.join('\n\n') },
          { role: 'user' as const, content: `Goal: ${state.goal}\nReturn the next JSON tool call or a final answer.` },
        ];

        let modelResponse = await ai.chat(modelMessages as any);
        let modelRaw = modelResponse.content || '';
        let parsed: any;
        try {
          parsed = parseModelJson(modelRaw);
        } catch (e) {
          // 自修复：要求模型只输出 JSON
          const retryMessages = [
            { role: 'system' as const, content: toolSpecText() },
            { role: 'user' as const, content: `Your previous output was not valid JSON. Output ONLY one JSON object now.\nPrevious:\n${modelRaw}` },
          ];
          modelResponse = await ai.chat(retryMessages as any);
          modelRaw = modelResponse.content || '';
          parsed = parseModelJson(modelRaw);
        }

        if (parsed?.final && typeof parsed.final === 'string') {
          state.status = 'done';
          state.finalAnswer = parsed.final;
          state.updatedAt = now();
          this.emitStatus(state);
          return;
        }

        const call: ToolCall = parsed?.tool ? { tool: parsed.tool, args: parsed.args || {} } : parsed;
        if (!call?.tool) throw new Error('Model did not return a tool call');

        const validation = validateToolCall(call);
        if (!validation.ok) {
          // 自修复：提示模型修正 tool/args
          const fixMessages = [
            { role: 'system' as const, content: toolSpecText() },
            { role: 'user' as const, content: `Your previous tool call was invalid: ${validation.reason}\nOutput a corrected JSON tool call now.\nPrevious:\n${JSON.stringify(call)}` },
          ];
          const fixedResponse = await ai.chat(fixMessages as any);
          const fixedRaw = fixedResponse.content || '';
          const fixedParsed = parseModelJson(fixedRaw);
          const fixedCall: ToolCall = fixedParsed?.tool ? { tool: fixedParsed.tool, args: fixedParsed.args || {} } : fixedParsed;
          const fixedValidation = validateToolCall(fixedCall);
          if (!fixedValidation.ok) {
            throw new Error(`Invalid tool call after repair: ${fixedValidation.reason}`);
          }
          // overwrite
          (call as any).tool = fixedCall.tool;
          (call as any).args = fixedCall.args;
        }

        const stepId = genId('step');
        this.pushStep(state, {
          stepId,
          tool: call.tool,
          args: call.args,
          status: 'running',
          startedAt: now(),
        });

        // P3：统一执行 + 自愈重试（elementId -> selectorHint）
        let attempts = 0;
        let locatorUsed: string = call.args?.elementId ? 'elementId' : call.args?.selector ? 'selector' : 'none';
        let result: ToolResult | null = null;

        const executeOnce = async (c: ToolCall) => {
          const resp: any = await sendToContent(
            state.tabId,
            createMessage('EXECUTE_TOOL', { runId, stepId, call: c })
          );
          return resp?.payload?.result || resp?.result || resp?.payload;
        };

        const tryHeal = (c: ToolCall): ToolCall | null => {
          if (c.tool !== 'click' && c.tool !== 'type') return null;
          const elementId = c.args?.elementId as string | undefined;
          if (!elementId) return null;
          const summary = scratch.elementIndex.get(elementId);
          const selectorHint = summary?.selectorHint;
          if (!selectorHint) return null;
          locatorUsed = 'selectorHint';
          return {
            ...c,
            args: { ...(c.args || {}), selector: selectorHint, elementId: undefined },
          };
        };

        let currentCall: ToolCall = call;
        while (attempts < 2) {
          attempts++;
          result = await executeOnce(currentCall);

          if (result?.requiresConfirmation) break;
          if (result?.ok) break;

          const err = (result?.error || '').toLowerCase();
          const healable =
            err.includes('not found') ||
            err.includes('target element') ||
            err.includes('missing') ||
            err.includes('not editable');

          const healed = healable ? tryHeal(currentCall) : null;
          if (!healed) break;
          currentCall = healed;
        }

        if (!result) throw new Error('Tool execution failed');

        // 高风险确认：如果需要确认则暂停，确认后用 force 重试同一步
        if (result?.requiresConfirmation) {
          state.status = 'waiting_confirmation';
          state.updatedAt = now();
          this.emitStatus(state);
          this.updateStep(state, stepId, { status: 'waiting_confirmation', result });

          const approved = await this.waitForConfirmation(runId, stepId, result);
          if (!approved) {
            this.updateStep(state, stepId, { status: 'cancelled', endedAt: now(), result: { ...result, error: 'User rejected confirmation' } });
            state.status = 'stopped';
            state.updatedAt = now();
            this.emitStatus(state);
            return;
          }

          // 执行强制版本（click/type 支持 force，其他工具忽略）
          const forcedCall: ToolCall = {
            ...currentCall,
            args: { ...(currentCall.args || {}), force: true },
          };
          result = await executeOnce(forcedCall);
        }

        const finalResult = result as ToolResult;

        // 记录 elements 索引（用于后续自愈）
        const elements = (finalResult as any)?.data?.elements as ElementSummary[] | undefined;
        if (Array.isArray(elements)) {
          for (const el of elements) {
            if (el?.id) scratch.elementIndex.set(el.id, el);
          }
        }

        this.updateStep(state, stepId, {
          status: finalResult?.ok ? 'completed' : 'failed',
          endedAt: now(),
          result: finalResult,
          attempts,
          locatorUsed,
        });
        // P2: 轻量 diff（根据 observations.visibleTextHash 判断页面是否变化）
        const currentHash = finalResult?.observations?.visibleTextHash;
        if (currentHash) {
          const changed = scratch.lastHash && scratch.lastHash !== currentHash;
          scratch.lastHash = currentHash;
          if (changed && finalResult?.data && typeof finalResult.data === 'object') {
            (finalResult.data as any).pageChanged = true;
          } else if (changed) {
            finalResult.data = { pageChanged: true } as any;
          }
          // 更新 step.result 以便 UI 看到 pageChanged
          this.updateStep(state, stepId, {
            result: finalResult,
          });
        }

        scratch.lastResult = finalResult;

        // 恢复 running（如果之前等待确认）
        if (state.status === 'waiting_confirmation') {
          state.status = 'running';
          state.updatedAt = now();
          this.emitStatus(state);
        }

        // 如果工具失败，允许模型给出 final 或下一步；但避免无限循环
      }

      state.status = 'failed';
      state.error = 'Reached max steps';
      state.updatedAt = now();
      this.emitStatus(state);
    } catch (e) {
      const state2 = this.runs.get(runId);
      if (!state2) return;
      state2.status = state2.status === 'stopped' ? 'stopped' : 'failed';
      state2.error = e instanceof Error ? e.message : 'Unknown error';
      state2.updatedAt = now();
      this.emitStatus(state2);
    }
  }

  private waitForConfirmation(runId: string, stepId: string, result: ToolResult): Promise<boolean> {
    const key = `${runId}:${stepId}`;
    return new Promise((resolve) => {
      this.pendingConfirmations.set(key, { resolve, createdAt: now() });
      chrome.runtime.sendMessage(
        createMessage('REQUEST_CONFIRMATION', {
          runId,
          stepId,
          title: '需要确认',
          description: result.confirmationMessage || '该操作可能有风险，是否继续？',
          tool: result.tool,
        })
      );
    });
  }
}

export const automationOrchestrator = new AutomationOrchestrator();


