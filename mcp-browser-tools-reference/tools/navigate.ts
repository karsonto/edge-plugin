/**
 * Navigate Tool - 浏览器导航工具
 * 
 * 功能:
 * - 导航到指定 URL
 * - 刷新当前页面
 * - 浏览器历史前进/后退
 * - 关闭标签页
 * - 切换标签页
 */

import { createErrorResponse, ToolResult } from '../core/tool-handler';
import { BaseBrowserToolExecutor } from '../core/base-browser';
import { TOOL_NAMES } from '../schemas/tool-schemas';

// 默认窗口尺寸
const DEFAULT_WINDOW_WIDTH = 1280;
const DEFAULT_WINDOW_HEIGHT = 720;

interface NavigateToolParams {
  url?: string;
  newWindow?: boolean;
  width?: number;
  height?: number;
  refresh?: boolean;
  tabId?: number;
  windowId?: number;
  background?: boolean;
}

/**
 * 导航工具
 */
class NavigateTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.NAVIGATE;

  async execute(args: NavigateToolParams): Promise<ToolResult> {
    const {
      newWindow = false,
      width,
      height,
      url,
      refresh = false,
      tabId,
      background,
      windowId,
    } = args;

    console.log(
      `Attempting to ${refresh ? 'refresh current tab' : `open URL: ${url}`}`,
    );

    try {
      // 1. 处理刷新操作
      if (refresh) {
        const explicit = await this.tryGetTab(tabId);
        const targetTab = explicit || (await this.getActiveTabOrThrowInWindow(windowId));
        if (!targetTab.id) return createErrorResponse('No target tab found to refresh');
        
        await chrome.tabs.reload(targetTab.id);
        const updatedTab = await chrome.tabs.get(targetTab.id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Successfully refreshed current tab',
                tabId: updatedTab.id,
                windowId: updatedTab.windowId,
                url: updatedTab.url,
              }),
            },
          ],
          isError: false,
        };
      }

      // 2. 验证 URL 参数
      if (!url) {
        return createErrorResponse('URL parameter is required when refresh is not true');
      }

      // 3. 处理浏览器历史导航
      if (url === 'back' || url === 'forward') {
        const explicitTab = await this.tryGetTab(tabId);
        const targetTab = explicitTab || (await this.getActiveTabOrThrowInWindow(windowId));
        if (!targetTab.id) {
          return createErrorResponse('No target tab found for history navigation');
        }

        await this.ensureFocus(targetTab, {
          activate: background !== true,
          focusWindow: background !== true,
        });

        if (url === 'forward') {
          await chrome.tabs.goForward(targetTab.id);
        } else {
          await chrome.tabs.goBack(targetTab.id);
        }

        const updatedTab = await chrome.tabs.get(targetTab.id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Successfully navigated ${url} in browser history`,
                tabId: updatedTab.id,
                windowId: updatedTab.windowId,
                url: updatedTab.url,
              }),
            },
          ],
          isError: false,
        };
      }

      // 4. 检查 URL 是否已打开
      const urlPatterns = this.buildUrlPatterns(url);
      const candidateTabs = await chrome.tabs.query({ url: urlPatterns });

      const explicitTab = await this.tryGetTab(tabId);
      const existingTab = explicitTab || this.pickBestMatch(url, candidateTabs);
      
      if (existingTab?.id !== undefined) {
        // URL 已打开，激活现有标签页
        if (explicitTab && typeof explicitTab.id === 'number') {
          await chrome.tabs.update(explicitTab.id, { url });
        }
        
        await this.ensureFocus(existingTab, {
          activate: background !== true,
          focusWindow: background !== true,
        });

        const updatedTab = await chrome.tabs.get(existingTab.id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Activated existing tab',
                tabId: updatedTab.id,
                windowId: updatedTab.windowId,
                url: updatedTab.url,
              }),
            },
          ],
          isError: false,
        };
      }

      // 5. 打开新窗口或新标签页
      const openInNewWindow = newWindow || typeof width === 'number' || typeof height === 'number';

      if (openInNewWindow) {
        const newWin = await chrome.windows.create({
          url: url,
          width: typeof width === 'number' ? width : DEFAULT_WINDOW_WIDTH,
          height: typeof height === 'number' ? height : DEFAULT_WINDOW_HEIGHT,
          focused: background === true ? false : true,
        });

        if (newWin && newWin.id !== undefined) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: 'Opened URL in new window',
                  windowId: newWin.id,
                  tabs: newWin.tabs?.map((tab) => ({ tabId: tab.id, url: tab.url })) || [],
                }),
              },
            ],
            isError: false,
          };
        }
      } else {
        // 在现有窗口中打开新标签页
        let targetWindow: chrome.windows.Window | null = null;
        if (typeof windowId === 'number') {
          targetWindow = await chrome.windows.get(windowId, { populate: false });
        }
        if (!targetWindow) {
          targetWindow = await chrome.windows.getLastFocused({ populate: false });
        }

        if (targetWindow && targetWindow.id !== undefined) {
          const newTab = await chrome.tabs.create({
            url: url,
            windowId: targetWindow.id,
            active: background === true ? false : true,
          });
          
          if (background !== true) {
            await chrome.windows.update(targetWindow.id, { focused: true });
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: 'Opened URL in new tab in existing window',
                  tabId: newTab.id,
                  windowId: targetWindow.id,
                  url: newTab.url,
                }),
              },
            ],
            isError: false,
          };
        }
      }

      return createErrorResponse('Failed to open URL: Unknown error occurred');
    } catch (error) {
      return createErrorResponse(
        `Error navigating: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 构建 URL 匹配模式
   */
  private buildUrlPatterns(input: string): string[] {
    const patterns = new Set<string>();
    try {
      if (!input.includes('*')) {
        const u = new URL(input);
        const pathWildcard = '/*';
        const hostNoWww = u.host.replace(/^www\./, '');
        const hostWithWww = hostNoWww.startsWith('www.') ? hostNoWww : `www.${hostNoWww}`;

        patterns.add(`${u.protocol}//${u.host}${pathWildcard}`);
        patterns.add(`${u.protocol}//${hostNoWww}${pathWildcard}`);
        patterns.add(`${u.protocol}//${hostWithWww}${pathWildcard}`);

        const altProtocol = u.protocol === 'https:' ? 'http:' : 'https:';
        patterns.add(`${altProtocol}//${u.host}${pathWildcard}`);
        patterns.add(`${altProtocol}//${hostNoWww}${pathWildcard}`);
        patterns.add(`${altProtocol}//${hostWithWww}${pathWildcard}`);
      } else {
        patterns.add(input);
      }
    } catch {
      patterns.add(input.endsWith('/') ? `${input}*` : `${input}/*`);
    }
    return Array.from(patterns);
  }

  /**
   * 选择最佳匹配的标签页
   */
  private pickBestMatch(target: string, tabs: chrome.tabs.Tab[]): chrome.tabs.Tab | undefined {
    if (tabs.length === 0) return undefined;
    
    try {
      const targetUrl = new URL(target);
      const normalizePath = (p: string) => {
        if (!p) return '/';
        const withLeading = p.startsWith('/') ? p : `/${p}`;
        return withLeading !== '/' && withLeading.endsWith('/')
          ? withLeading.slice(0, -1)
          : withLeading;
      };

      const hostBase = (h: string) => h.replace(/^www\./, '').toLowerCase();
      const targetPath = normalizePath(targetUrl.pathname);
      const targetHostBase = hostBase(targetUrl.host);

      for (const tab of tabs) {
        try {
          const tabUrl = new URL(tab.url || '');
          if (hostBase(tabUrl.host) === targetHostBase) {
            if (normalizePath(tabUrl.pathname) === targetPath) {
              return tab;
            }
          }
        } catch {
          continue;
        }
      }
    } catch {
      // 无法解析 URL
    }
    
    return tabs[0];
  }
}

export const navigateTool = new NavigateTool();

// ============================================
// Close Tabs Tool
// ============================================

interface CloseTabsToolParams {
  tabIds?: number[];
  url?: string;
}

class CloseTabsTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.CLOSE_TABS;

  async execute(args: CloseTabsToolParams): Promise<ToolResult> {
    const { tabIds, url } = args;

    try {
      // 按 URL 关闭
      if (url) {
        let urlPattern = url;
        if (!urlPattern.includes('*')) {
          try {
            const u = new URL(urlPattern);
            const basePath = u.pathname || '/';
            const pathWithWildcard = basePath.endsWith('/') ? `${basePath}*` : `${basePath}/*`;
            urlPattern = `${u.protocol}//${u.host}${pathWithWildcard}`;
          } catch {
            urlPattern = urlPattern.endsWith('/') ? `${urlPattern}*` : `${urlPattern}/*`;
          }
        }

        const tabs = await chrome.tabs.query({ url: urlPattern });

        if (!tabs || tabs.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  message: `No tabs found with URL pattern: ${urlPattern}`,
                  closedCount: 0,
                }),
              },
            ],
            isError: false,
          };
        }

        const tabIdsToClose = tabs
          .map((tab) => tab.id)
          .filter((id): id is number => id !== undefined);

        await chrome.tabs.remove(tabIdsToClose);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Closed ${tabIdsToClose.length} tabs`,
                closedCount: tabIdsToClose.length,
                closedTabIds: tabIdsToClose,
              }),
            },
          ],
          isError: false,
        };
      }

      // 按 ID 关闭
      if (tabIds && tabIds.length > 0) {
        const existingTabs = await Promise.all(
          tabIds.map(async (tabId) => {
            try {
              return await chrome.tabs.get(tabId);
            } catch {
              return null;
            }
          }),
        );

        const validTabIds = existingTabs
          .filter((tab): tab is chrome.tabs.Tab => tab !== null)
          .map((tab) => tab.id)
          .filter((id): id is number => id !== undefined);

        if (validTabIds.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  message: 'None of the provided tab IDs exist',
                  closedCount: 0,
                }),
              },
            ],
            isError: false,
          };
        }

        await chrome.tabs.remove(validTabIds);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Closed ${validTabIds.length} tabs`,
                closedCount: validTabIds.length,
                closedTabIds: validTabIds,
              }),
            },
          ],
          isError: false,
        };
      }

      // 关闭当前活动标签页
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.id) {
        return createErrorResponse('No active tab found');
      }

      await chrome.tabs.remove(activeTab.id);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Closed active tab',
              closedCount: 1,
              closedTabIds: [activeTab.id],
            }),
          },
        ],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(
        `Error closing tabs: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const closeTabsTool = new CloseTabsTool();

// ============================================
// Switch Tab Tool
// ============================================

interface SwitchTabToolParams {
  tabId: number;
  windowId?: number;
}

class SwitchTabTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.SWITCH_TAB;

  async execute(args: SwitchTabToolParams): Promise<ToolResult> {
    const { tabId, windowId } = args;

    try {
      if (windowId !== undefined) {
        await chrome.windows.update(windowId, { focused: true });
      }
      await chrome.tabs.update(tabId, { active: true });

      const updatedTab = await chrome.tabs.get(tabId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Successfully switched to tab ID: ${tabId}`,
              tabId: updatedTab.id,
              windowId: updatedTab.windowId,
              url: updatedTab.url,
            }),
          },
        ],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(
        `Error switching tab: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const switchTabTool = new SwitchTabTool();
