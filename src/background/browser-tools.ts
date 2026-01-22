/**
 * Background Browser Tools - 需要在 background script 执行的工具
 * 这些工具需要使用 Chrome Extension API，无法在 content script 中执行
 */

import type { ToolResult } from '@/shared/types';
import { TOOL_ERRORS, DEFAULT_WINDOW } from '@/shared/constants';

/**
 * 构建 URL 匹配模式
 */
function buildUrlPatterns(input: string): string[] {
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
function pickBestMatch(target: string, tabs: chrome.tabs.Tab[]): chrome.tabs.Tab | undefined {
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

/**
 * 导航工具
 */
export async function tool_navigate(args: any): Promise<ToolResult<{ url: string; tabId?: number; windowId?: number }>> {
  const { url, newWindow, width, height, refresh, tabId, windowId, background } = args;

  try {
    // 处理刷新操作
    if (refresh) {
      const targetTabId = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
      if (!targetTabId) {
        return { ok: false, tool: 'navigate', error: TOOL_ERRORS.TAB_NOT_FOUND };
      }

      await chrome.tabs.reload(targetTabId);
      const updatedTab = await chrome.tabs.get(targetTabId);

      return {
        ok: true,
        tool: 'navigate',
        data: {
          url: updatedTab.url || '',
          tabId: updatedTab.id,
          windowId: updatedTab.windowId,
        },
      };
    }

    // 验证 URL 参数
    if (!url) {
      return { ok: false, tool: 'navigate', error: TOOL_ERRORS.MISSING_REQUIRED_PARAM + ': url' };
    }

    // 处理浏览器历史导航
    if (url === 'back' || url === 'forward') {
      const targetTabId = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
      if (!targetTabId) {
        return { ok: false, tool: 'navigate', error: TOOL_ERRORS.TAB_NOT_FOUND };
      }

      if (url === 'forward') {
        await chrome.tabs.goForward(targetTabId);
      } else {
        await chrome.tabs.goBack(targetTabId);
      }

      const updatedTab = await chrome.tabs.get(targetTabId);

      return {
        ok: true,
        tool: 'navigate',
        data: {
          url: updatedTab.url || '',
          tabId: updatedTab.id,
          windowId: updatedTab.windowId,
        },
      };
    }

    // 检查 URL 是否已打开
    const urlPatterns = buildUrlPatterns(url);
    const candidateTabs = await chrome.tabs.query({ url: urlPatterns });

    const explicitTab = tabId ? await chrome.tabs.get(tabId).catch(() => null) : null;
    const existingTab = explicitTab || pickBestMatch(url, candidateTabs);

    if (existingTab?.id !== undefined) {
      // URL 已打开，激活现有标签页
      if (explicitTab && typeof explicitTab.id === 'number') {
        await chrome.tabs.update(explicitTab.id, { url });
      }

      if (background !== true) {
        await chrome.tabs.update(existingTab.id, { active: true });
        if (typeof existingTab.windowId === 'number') {
          await chrome.windows.update(existingTab.windowId, { focused: true });
        }
      }

      const updatedTab = await chrome.tabs.get(existingTab.id);

      return {
        ok: true,
        tool: 'navigate',
        data: {
          url: updatedTab.url || '',
          tabId: updatedTab.id,
          windowId: updatedTab.windowId,
        },
      };
    }

    // 打开新窗口或新标签页
    const openInNewWindow = newWindow || typeof width === 'number' || typeof height === 'number';

    if (openInNewWindow) {
      const newWin = await chrome.windows.create({
        url: url,
        width: typeof width === 'number' ? width : DEFAULT_WINDOW.WIDTH,
        height: typeof height === 'number' ? height : DEFAULT_WINDOW.HEIGHT,
        focused: background !== true,
      });

      if (newWin && newWin.id !== undefined && newWin.tabs?.[0]) {
        return {
          ok: true,
          tool: 'navigate',
          data: {
            url: newWin.tabs[0].url || '',
            tabId: newWin.tabs[0].id,
            windowId: newWin.id,
          },
        };
      }
    } else {
      // 在现有窗口中打开新标签页
      let targetWindow: chrome.windows.Window | null = null;
      if (typeof windowId === 'number') {
        targetWindow = await chrome.windows.get(windowId).catch(() => null);
      }
      if (!targetWindow) {
        targetWindow = await chrome.windows.getLastFocused();
      }

      if (targetWindow && targetWindow.id !== undefined) {
        const newTab = await chrome.tabs.create({
          url: url,
          windowId: targetWindow.id,
          active: background !== true,
        });

        if (background !== true) {
          await chrome.windows.update(targetWindow.id, { focused: true });
        }

        return {
          ok: true,
          tool: 'navigate',
          data: {
            url: newTab.url || '',
            tabId: newTab.id,
            windowId: targetWindow.id,
          },
        };
      }
    }

    return { ok: false, tool: 'navigate', error: TOOL_ERRORS.NAVIGATION_FAILED };
  } catch (error) {
    return {
      ok: false,
      tool: 'navigate',
      error: `Navigation error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 刷新页面
 */
export async function tool_refresh(args: any): Promise<ToolResult<{ url: string; tabId?: number }>> {
  return tool_navigate({ ...args, refresh: true });
}

/**
 * 浏览器历史后退
 */
export async function tool_goBack(args: any): Promise<ToolResult<{ url: string; tabId?: number }>> {
  return tool_navigate({ ...args, url: 'back' });
}

/**
 * 浏览器历史前进
 */
export async function tool_goForward(args: any): Promise<ToolResult<{ url: string; tabId?: number }>> {
  return tool_navigate({ ...args, url: 'forward' });
}

/**
 * 获取所有窗口和标签页
 */
export async function tool_getWindowsAndTabs(_args: any): Promise<ToolResult<{
  windowCount: number;
  tabCount: number;
  windows: Array<{
    windowId: number;
    tabs: Array<{ tabId: number; url: string; title: string; active: boolean }>;
  }>;
}>> {
  try {
    const windows = await chrome.windows.getAll({ populate: true });
    let tabCount = 0;

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

    return {
      ok: true,
      tool: 'getWindowsAndTabs',
      data: {
        windowCount: windows.length,
        tabCount: tabCount,
        windows: structuredWindows,
      },
    };
  } catch (error) {
    return {
      ok: false,
      tool: 'getWindowsAndTabs',
      error: `Error getting windows and tabs: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 切换标签页
 */
export async function tool_switchTab(args: any): Promise<ToolResult<{ url: string; tabId: number; windowId?: number }>> {
  const { tabId, windowId } = args;

  if (typeof tabId !== 'number') {
    return { ok: false, tool: 'switchTab', error: TOOL_ERRORS.MISSING_REQUIRED_PARAM + ': tabId' };
  }

  try {
    if (typeof windowId === 'number') {
      await chrome.windows.update(windowId, { focused: true });
    }
    await chrome.tabs.update(tabId, { active: true });

    const updatedTab = await chrome.tabs.get(tabId);

    return {
      ok: true,
      tool: 'switchTab',
      data: {
        url: updatedTab.url || '',
        tabId: updatedTab.id || tabId,
        windowId: updatedTab.windowId,
      },
    };
  } catch (error) {
    return {
      ok: false,
      tool: 'switchTab',
      error: `Error switching tab: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 关闭标签页
 */
export async function tool_closeTab(args: any): Promise<ToolResult<{ closedCount: number; closedTabIds: number[] }>> {
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
          ok: true,
          tool: 'closeTab',
          data: { closedCount: 0, closedTabIds: [] },
        };
      }

      const tabIdsToClose = tabs.map((tab) => tab.id).filter((id): id is number => id !== undefined);

      await chrome.tabs.remove(tabIdsToClose);

      return {
        ok: true,
        tool: 'closeTab',
        data: {
          closedCount: tabIdsToClose.length,
          closedTabIds: tabIdsToClose,
        },
      };
    }

    // 按 ID 关闭
    if (tabIds && Array.isArray(tabIds) && tabIds.length > 0) {
      const existingTabs = await Promise.all(
        tabIds.map(async (tabId: number) => {
          try {
            return await chrome.tabs.get(tabId);
          } catch {
            return null;
          }
        })
      );

      const validTabIds = existingTabs
        .filter((tab): tab is chrome.tabs.Tab => tab !== null)
        .map((tab) => tab.id)
        .filter((id): id is number => id !== undefined);

      if (validTabIds.length === 0) {
        return {
          ok: true,
          tool: 'closeTab',
          data: { closedCount: 0, closedTabIds: [] },
        };
      }

      await chrome.tabs.remove(validTabIds);

      return {
        ok: true,
        tool: 'closeTab',
        data: {
          closedCount: validTabIds.length,
          closedTabIds: validTabIds,
        },
      };
    }

    // 关闭当前活动标签页
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.id) {
      return { ok: false, tool: 'closeTab', error: TOOL_ERRORS.TAB_NOT_FOUND };
    }

    await chrome.tabs.remove(activeTab.id);

    return {
      ok: true,
      tool: 'closeTab',
      data: {
        closedCount: 1,
        closedTabIds: [activeTab.id],
      },
    };
  } catch (error) {
    return {
      ok: false,
      tool: 'closeTab',
      error: `Error closing tabs: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
