/**
 * Content Script 入口
 */

import type { ExecuteToolMessage, Message, PageContext } from '@/shared/types';
import { onMessage, createMessage } from '@/shared/utils/message-bridge';
import { extractPageContext } from './text-extractor';
import { SelectionHandler } from './selection-handler';
import { clearHighlight } from './overlay';
import { executeTool } from './browser-tools';
import { APP_NAME } from '@/shared/brand';

console.log(`${APP_NAME} content script loaded`);

// 注入 CSS 样式
const style = document.createElement('style');
style.textContent = `
/* Content Script 样式 */
.edage-floating-button {
  position: fixed;
  z-index: 999999;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
  transition: all 0.2s;
}

.edage-floating-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.5);
}

.edage-floating-button:active {
  transform: translateY(0);
}
`;
document.head.appendChild(style);

// 初始化选择处理器
const selectionHandler = new SelectionHandler({
  showFloatingButton: false,
  onSelection: (text) => {
    console.log('Text selected:', text.substring(0, 50) + '...');
  },
});

selectionHandler.init();

// 监听来自 background 或 sidepanel 的消息
onMessage((message: Message, _sender, sendResponse) => {
  console.log('Content script received message:', message.type);

  switch (message.type) {
    case 'GET_PAGE_CONTEXT':
      handleGetPageContext(sendResponse);
      return true; // 保持消息通道开启

    case 'EXECUTE_TOOL':
      handleExecuteTool(message as ExecuteToolMessage, sendResponse);
      return true;

    default:
      break;
  }

  return false;
});

/**
 * 处理获取页面上下文请求
 */
function handleGetPageContext(
  sendResponse: (response: any) => void
) {
  try {
    // 默认提取“全页可见文字”，更适配 SPA/后台系统页面
    const context: PageContext = extractPageContext('full');
    
    sendResponse(
      createMessage('PAGE_CONTEXT_RESPONSE', context)
    );
  } catch (error) {
    console.error('Error extracting page context:', error);
    sendResponse({
      type: 'ERROR',
      payload: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

async function handleExecuteTool(message: ExecuteToolMessage, sendResponse: (response: any) => void) {
  try {
    const { runId, stepId, call } = message.payload;
    const result = await executeTool(call);
    sendResponse(createMessage('TOOL_RESULT', { runId, stepId, result }));
  } catch (error) {
    sendResponse({
      type: 'ERROR',
      payload: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

// 快捷键：Ctrl+Shift+R 刷新页面内容（通知 sidepanel）
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
    e.preventDefault();
    console.log(`${APP_NAME}: 快捷键触发刷新页面内容`);
    
    // 通知 sidepanel 刷新
    chrome.runtime.sendMessage(
      createMessage('REFRESH_PAGE_CONTEXT', {}),
      () => {
        // 忽略无接收者的错误（sidepanel 可能未打开）
        if (chrome.runtime.lastError) {
          // 静默忽略
        }
      }
    );
  }
});

// ============ 路由变化监听 ============
let lastUrl = location.href;
let refreshTimer: number | null = null;
let domChangeTimer: number | null = null;

/**
 * 通知 sidepanel 刷新页面内容（带防抖）
 */
function notifyPageContextRefresh() {
  // 清除之前的定时器
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
  
  // 防抖：500ms 内多次变化只触发一次
  refreshTimer = window.setTimeout(() => {
    const currentUrl = location.href;
    
    // 只有当 URL 真正变化时才通知
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log(`${APP_NAME}: 检测到路由变化，通知刷新页面内容`, currentUrl);
      
      // 通知 sidepanel 刷新
      chrome.runtime.sendMessage(
        createMessage('REFRESH_PAGE_CONTEXT', {}),
        () => {
          // 忽略无接收者的错误（sidepanel 可能未打开）
          if (chrome.runtime.lastError) {
            // 静默忽略
          }
        }
      );
    }
  }, 500);
}

// 1. 监听浏览器前进后退（popstate）
window.addEventListener('popstate', () => {
  notifyPageContextRefresh();
});

// 2. 监听 hash 变化（hash 路由）
window.addEventListener('hashchange', () => {
  notifyPageContextRefresh();
});

// 3. 拦截 SPA 路由变化（pushState 和 replaceState）
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function(...args) {
  originalPushState.apply(history, args);
  notifyPageContextRefresh();
};

history.replaceState = function(...args) {
  originalReplaceState.apply(history, args);
  notifyPageContextRefresh();
};

// 4. 监听 DOM 变化（作为补充，检测页面内容变化）
// 注意：这个可能会频繁触发，所以使用较长的防抖时间
let domObserver: MutationObserver | null = null;

function initDOMObserver() {
  if (domObserver) {
    return; // 已经初始化
  }

  domObserver = new MutationObserver(() => {
    // 清除之前的定时器
    if (domChangeTimer) {
      clearTimeout(domChangeTimer);
    }
    
    // 较长的防抖时间（2秒），避免频繁刷新
    domChangeTimer = window.setTimeout(() => {
      // 检查 URL 是否变化（可能通过其他方式变化）
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        notifyPageContextRefresh();
      }
    }, 2000);
  });

  // 开始观察 DOM 变化（但只在 body 存在时）
  if (document.body) {
    domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'id'], // 只观察可能影响路由的属性
    });
  } else {
    // 如果 body 还没加载，等待 DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body && domObserver) {
        domObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'id'],
        });
      }
    });
  }
}

// 初始化 DOM 观察器
initDOMObserver();

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
  if (domChangeTimer) {
    clearTimeout(domChangeTimer);
  }
  if (domObserver) {
    domObserver.disconnect();
  }
  selectionHandler.destroy();
  clearHighlight();
});
