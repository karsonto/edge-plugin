import { create } from 'zustand';
import type { PageContext } from '@/shared/types';
import { sendToBackground, createMessage } from '@/shared/utils';

interface PageContextStore {
  context: PageContext | null;
  isLoading: boolean;
  error: string | null;
  
  fetchPageContext: () => Promise<void>;
  clearContext: () => void;
}

export const usePageContext = create<PageContextStore>((set) => ({
  context: null,
  isLoading: false,
  error: null,

  fetchPageContext: async () => {
    set({ isLoading: true, error: null });

    try {
      // 首先尝试从当前标签页获取
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab?.id) {
        throw new Error('No active tab found');
      }

      // 发送消息到 content script（通过 background）
      const response = await sendToBackground(
        createMessage('GET_PAGE_CONTEXT', { tabId: tab.id })
      );

      // 只接受明确的 PAGE_CONTEXT_RESPONSE，避免把 ERROR payload 当成 PageContext 导致白屏
      if (response?.type === 'PAGE_CONTEXT_RESPONSE' && typeof response?.payload?.content === 'string') {
        set({
          context: response.payload,
          isLoading: false,
        });
      } else {
        const errMsg =
          response?.payload?.error ||
          (response?.type ? `Failed to get page context (${response.type})` : 'Failed to get page context');
        throw new Error(errMsg);
      }
    } catch (error) {
      console.error('Error fetching page context:', error);
      set({
        context: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false,
      });
    }
  },

  clearContext: () => {
    set({ context: null, error: null });
  },
}));
