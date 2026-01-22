/**
 * Window Tool - 获取浏览器窗口和标签页信息
 * 
 * 功能: 列出所有打开的浏览器窗口及其标签页
 */

import { createErrorResponse, ToolResult } from '../core/tool-handler';
import { BaseBrowserToolExecutor } from '../core/base-browser';
import { TOOL_NAMES } from '../schemas/tool-schemas';

/**
 * 窗口和标签页工具
 */
class WindowTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.GET_WINDOWS_AND_TABS;

  async execute(): Promise<ToolResult> {
    try {
      // 获取所有窗口及其标签页
      const windows = await chrome.windows.getAll({ populate: true });
      let tabCount = 0;

      // 构建结构化的窗口信息
      const structuredWindows = windows.map((window) => {
        const tabs =
          window.tabs?.map((tab) => {
            tabCount++;
            return {
              tabId: tab.id || 0,
              url: tab.url || '',
              title: tab.title || '',
              active: tab.active || false,
            };
          }) || [];

        return {
          windowId: window.id || 0,
          tabs: tabs,
        };
      });

      const result = {
        windowCount: windows.length,
        tabCount: tabCount,
        windows: structuredWindows,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
        isError: false,
      };
    } catch (error) {
      console.error('Error in WindowTool.execute:', error);
      return createErrorResponse(
        `Error getting windows and tabs information: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const windowTool = new WindowTool();
