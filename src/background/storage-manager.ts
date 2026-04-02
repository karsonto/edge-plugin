/**
 * 存储管理器
 */

import type { AppConfig } from '@/shared/types';
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
   * 保存页面上下文
   */
  async savePageContext(context: any): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_KEYS.LAST_PAGE_CONTEXT]: context,
    });
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
