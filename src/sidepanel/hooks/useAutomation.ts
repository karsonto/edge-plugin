import { create } from 'zustand';
import type { AutomationRunState, ConfirmationRequestPayload } from '@/shared/types';
import { createMessage, onMessage, sendToBackground } from '@/shared/utils';

interface AutomationStore {
  run: AutomationRunState | null;
  history: AutomationRunState[];
  pendingConfirmation: ConfirmationRequestPayload | null;
  isStarting: boolean;
  error: string | null;

  start: (goal: string, context?: string) => Promise<void>;
  stop: () => Promise<void>;
  confirm: (approved: boolean) => Promise<void>;
  loadHistory: () => Promise<void>;
  clearError: () => void;
}

export const useAutomation = create<AutomationStore>((set, get) => {
  onMessage((message) => {
    switch (message.type) {
      case 'AUTOMATION_STATUS':
        set({ run: message.payload });
        break;
      case 'AUTOMATION_HISTORY_RESPONSE':
        set({ history: message.payload });
        break;
      case 'REQUEST_CONFIRMATION':
        set({ pendingConfirmation: message.payload });
        break;
    }
  });

  return {
    run: null,
    history: [],
    pendingConfirmation: null,
    isStarting: false,
    error: null,

    start: async (goal: string, context?: string) => {
      if (!goal.trim()) return;
      set({ isStarting: true, error: null });
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error('No active tab found');

        const resp: any = await sendToBackground(
          createMessage('RUN_AUTOMATION', { tabId: tab.id, goal: goal.trim(), context })
        );
        if (resp?.type === 'ERROR') {
          throw new Error(resp?.payload?.error || '启动自动化失败');
        }
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'Unknown error' });
      } finally {
        set({ isStarting: false });
      }
    },

    stop: async () => {
      const runId = get().run?.runId;
      if (!runId) return;
      try {
        await sendToBackground(createMessage('STOP_AUTOMATION', { runId }));
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'Unknown error' });
      }
    },

    confirm: async (approved: boolean) => {
      const pending = get().pendingConfirmation;
      if (!pending) return;
      try {
        await sendToBackground(
          createMessage('CONFIRMATION_RESPONSE', {
            runId: pending.runId,
            stepId: pending.stepId,
            approved,
          })
        );
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'Unknown error' });
      } finally {
        set({ pendingConfirmation: null });
      }
    },

    loadHistory: async () => {
      try {
        const resp: any = await sendToBackground(createMessage('LOAD_AUTOMATION_HISTORY'));
        if (resp?.type === 'AUTOMATION_HISTORY_RESPONSE') {
          set({ history: resp.payload });
        } else if (resp?.type === 'ERROR') {
          throw new Error(resp?.payload?.error || '加载自动化历史失败');
        }
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'Unknown error' });
      }
    },

    clearError: () => set({ error: null }),
  };
});


