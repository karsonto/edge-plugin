import type { ToolCall, ToolResult } from '@/shared/types';
import { createMessage, generateMessageId } from '@/shared/utils';

export async function executeToolInContent(call: ToolCall, signal?: AbortSignal): Promise<ToolResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;
  if (typeof tabId !== 'number') {
    throw new Error('未找到活动标签页');
  }

  const runId = 'chat';
  const stepId = generateMessageId();

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const timeoutMs = call.tool === 'screenshotPage' ? 60000 : 15000;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      if (timeout) {
        clearTimeout(timeout);
      }
      fn();
    };

    const onAbort = () => {
      chrome.tabs.sendMessage(
        tabId,
        createMessage('ABORT_TOOL', {
          runId,
          stepId,
        }),
        () => {
          // 忽略 abort 回调错误；目标页可能已经销毁或未响应
          if (chrome.runtime.lastError) {
            // noop
          }
        }
      );

      finish(() => reject(new Error('操作已中断。')));
    };

    timeout = setTimeout(() => {
      finish(() => reject(new Error('工具执行超时')));
    }, timeoutMs);

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener('abort', onAbort, { once: true });

    chrome.tabs.sendMessage(
      tabId,
      createMessage('EXECUTE_TOOL', {
        runId,
        stepId,
        call,
      }),
      (response) => {
        if (settled) return;

        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          finish(() => reject(new Error(runtimeError.message)));
        } else if (response?.type === 'TOOL_RESULT') {
          finish(() => resolve(response.payload.result));
        } else {
          finish(() => reject(new Error('工具执行返回无效响应')));
        }
      }
    );
  });
}
