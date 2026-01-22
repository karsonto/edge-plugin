/**
 * Base Browser Tool Executor - 浏览器工具基类
 * 
 * 所有浏览器工具的抽象基类，提供:
 * - Content Script 注入
 * - 消息发送
 * - 标签页管理
 * - 焦点控制
 */

import { ToolExecutor } from './tool-handler';
import type { ToolResult } from './tool-handler';
import { TIMEOUTS, ERROR_MESSAGES } from './constants';

const PING_TIMEOUT_MS = 300;

/**
 * 浏览器工具执行器基类
 */
export abstract class BaseBrowserToolExecutor implements ToolExecutor {
  /** 工具名称 */
  abstract name: string;
  
  /** 执行工具 */
  abstract execute(args: any): Promise<ToolResult>;

  /**
   * 注入 Content Script 到标签页
   * 
   * @param tabId 标签页 ID
   * @param files 要注入的脚本文件列表
   * @param injectImmediately 是否立即注入
   * @param world 执行环境 ('MAIN' | 'ISOLATED')
   * @param allFrames 是否注入所有 frame
   * @param frameIds 指定 frame ID 列表
   */
  protected async injectContentScript(
    tabId: number,
    files: string[],
    injectImmediately = false,
    world: 'MAIN' | 'ISOLATED' = 'ISOLATED',
    allFrames: boolean = false,
    frameIds?: number[],
  ): Promise<void> {
    console.log(`Injecting ${files.join(', ')} into tab ${tabId}`);

    // 检查脚本是否已注入 (通过 ping)
    try {
      const pingFrameId = frameIds?.[0];
      const response = await Promise.race([
        typeof pingFrameId === 'number'
          ? chrome.tabs.sendMessage(
              tabId,
              { action: `${this.name}_ping` },
              { frameId: pingFrameId },
            )
          : chrome.tabs.sendMessage(tabId, { action: `${this.name}_ping` }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`${this.name} Ping action to tab ${tabId} timed out`)),
            PING_TIMEOUT_MS,
          ),
        ),
      ]);

      if (response && (response as any).status === 'pong') {
        console.log(
          `pong received for action '${this.name}' in tab ${tabId}. Script already active.`,
        );
        return;
      }
    } catch (error) {
      console.log(`Ping failed, will inject script: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 注入脚本
    try {
      const target: { tabId: number; allFrames?: boolean; frameIds?: number[] } = { tabId };
      if (frameIds && frameIds.length > 0) {
        target.frameIds = frameIds;
      } else if (allFrames) {
        target.allFrames = true;
      }
      
      await chrome.scripting.executeScript({
        target,
        files,
        injectImmediately,
        world,
      } as any);
      
      console.log(`'${files.join(', ')}' injection successful for tab ${tabId}`);
    } catch (injectionError) {
      const errorMessage =
        injectionError instanceof Error ? injectionError.message : String(injectionError);
      console.error(
        `Content script injection failed for tab ${tabId}: ${errorMessage}`,
      );
      throw new Error(
        `${ERROR_MESSAGES.TOOL_EXECUTION_FAILED}: Failed to inject content script: ${errorMessage}`,
      );
    }
  }

  /**
   * 发送消息到标签页
   * 
   * @param tabId 标签页 ID
   * @param message 消息对象
   * @param frameId 可选的 frame ID
   * @returns 响应数据
   */
  protected async sendMessageToTab(tabId: number, message: any, frameId?: number): Promise<any> {
    try {
      const response =
        typeof frameId === 'number'
          ? await chrome.tabs.sendMessage(tabId, message, { frameId })
          : await chrome.tabs.sendMessage(tabId, message);

      if (response && response.error) {
        throw new Error(String(response.error));
      }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `Error sending message to tab ${tabId} for action ${message?.action || 'unknown'}: ${errorMessage}`,
      );

      if (error instanceof Error) {
        throw error;
      }
      throw new Error(errorMessage);
    }
  }

  /**
   * 尝试获取标签页
   * 
   * @param tabId 标签页 ID
   * @returns 标签页对象或 null
   */
  protected async tryGetTab(tabId?: number): Promise<chrome.tabs.Tab | null> {
    if (typeof tabId !== 'number') return null;
    try {
      return await chrome.tabs.get(tabId);
    } catch {
      return null;
    }
  }

  /**
   * 获取当前活动标签页 (抛出错误版本)
   */
  protected async getActiveTabOrThrow(): Promise<chrome.tabs.Tab> {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!active || !active.id) throw new Error('Active tab not found');
    return active;
  }

  /**
   * 确保标签页获得焦点
   * 
   * @param tab 标签页对象
   * @param options 焦点选项
   */
  protected async ensureFocus(
    tab: chrome.tabs.Tab,
    options: { activate?: boolean; focusWindow?: boolean } = {},
  ): Promise<void> {
    const activate = options.activate === true;
    const focusWindow = options.focusWindow === true;
    
    if (focusWindow && typeof tab.windowId === 'number') {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    if (activate && typeof tab.id === 'number') {
      await chrome.tabs.update(tab.id, { active: true });
    }
  }

  /**
   * 获取指定窗口的活动标签页
   * 
   * @param windowId 窗口 ID (可选)
   */
  protected async getActiveTabInWindow(windowId?: number): Promise<chrome.tabs.Tab | null> {
    if (typeof windowId === 'number') {
      const tabs = await chrome.tabs.query({ active: true, windowId });
      return tabs && tabs[0] ? tabs[0] : null;
    }
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0] ? tabs[0] : null;
  }

  /**
   * 获取指定窗口的活动标签页 (抛出错误版本)
   */
  protected async getActiveTabOrThrowInWindow(windowId?: number): Promise<chrome.tabs.Tab> {
    const tab = await this.getActiveTabInWindow(windowId);
    if (!tab || !tab.id) throw new Error('Active tab not found');
    return tab;
  }
}
