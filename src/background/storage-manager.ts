/**
 * 存储管理器
 */

import type { AppConfig, AutomationRunState } from '@/shared/types';
import { STORAGE_KEYS, DEFAULT_CONFIG } from '@/shared/constants';

/**
 * 存储管理器类
 */
export class StorageManager {
  /**
   * 保存配置
   */
  async saveConfig(config: Partial<AppConfig>): Promise<void> {
    const currentConfig = await this.loadConfig();
    const newConfig = { ...currentConfig, ...config };
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.CONFIG]: newConfig,
    });
  }

  /**
   * 加载配置
   */
  async loadConfig(): Promise<AppConfig> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
    return result[STORAGE_KEYS.CONFIG] || DEFAULT_CONFIG;
  }

  /**
   * 清除配置
   */
  async clearConfig(): Promise<void> {
    await chrome.storage.local.remove(STORAGE_KEYS.CONFIG);
  }

  /**
   * 保存聊天历史
   */
  async saveChatHistory(messages: any[]): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_KEYS.CHAT_HISTORY]: messages,
    });
  }

  /**
   * 加载聊天历史
   */
  async loadChatHistory(): Promise<any[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.CHAT_HISTORY);
    return result[STORAGE_KEYS.CHAT_HISTORY] || [];
  }

  /**
   * 清除聊天历史
   */
  async clearChatHistory(): Promise<void> {
    await chrome.storage.local.remove(STORAGE_KEYS.CHAT_HISTORY);
  }

  /**
   * 保存页面上下文
   */
  async savePageContext(context: any): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_KEYS.LAST_PAGE_CONTEXT]: context,
    });
  }

  /**
   * 加载页面上下文
   */
  async loadPageContext(): Promise<any> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_PAGE_CONTEXT);
    return result[STORAGE_KEYS.LAST_PAGE_CONTEXT] || null;
  }

  /**
   * 保存自动化运行历史（最近 N 条）
   */
  async saveAutomationRun(run: AutomationRunState, maxItems: number = 20): Promise<void> {
    const history = await this.loadAutomationHistory();

    const withoutSame = history.filter(r => r.runId !== run.runId);
    const next = [run, ...withoutSame].slice(0, maxItems);

    await chrome.storage.local.set({
      [STORAGE_KEYS.AUTOMATION_HISTORY]: next,
    });
  }

  /**
   * 加载自动化运行历史
   */
  async loadAutomationHistory(): Promise<AutomationRunState[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.AUTOMATION_HISTORY);
    return result[STORAGE_KEYS.AUTOMATION_HISTORY] || [];
  }

  /**
   * 监听存储变化
   */
  onStorageChanged(
    callback: (changes: { [key: string]: chrome.storage.StorageChange }) => void
  ): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        callback(changes);
      }
    });
  }
}

export const storageManager = new StorageManager();
