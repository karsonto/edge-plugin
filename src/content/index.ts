/**
 * Content Script 入口
 */

import type {
  AbortToolMessage,
  CancelIframePickerMessage,
  ExecuteToolMessage,
  IframePickedMessage,
  Message,
  PageContext,
  SelectedIframeTarget,
  StartIframePickerMessage,
} from '@/shared/types';
import { onMessage, createMessage } from '@/shared/utils/message-bridge';
import { extractPageContext } from './text-extractor';
import { SelectionHandler } from './selection-handler';
import { clearHighlight, showRectHighlight } from './overlay';
import { executeTool, getOrCreateElementId } from './browser-tools';
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

const activeToolControllers = new Map<string, AbortController>();
let cleanupIframePicker: (() => void) | null = null;

function getToolExecutionKey(runId: string, stepId: string) {
  return `${runId}:${stepId}`;
}

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

    case 'ABORT_TOOL':
      handleAbortTool(message as AbortToolMessage, sendResponse);
      return true;

    case 'START_IFRAME_PICKER':
      handleStartIframePicker(message as StartIframePickerMessage, sendResponse);
      return true;

    case 'CANCEL_IFRAME_PICKER':
      handleCancelIframePicker(message as CancelIframePickerMessage, sendResponse);
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
  const { runId, stepId, call } = message.payload;
  const key = getToolExecutionKey(runId, stepId);
  const controller = new AbortController();
  activeToolControllers.set(key, controller);

  try {
    const result = await executeTool(call, controller.signal);
    sendResponse(createMessage('TOOL_RESULT', { runId, stepId, result }));
  } catch (error) {
    sendResponse({
      type: 'ERROR',
      payload: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  } finally {
    activeToolControllers.delete(key);
  }
}

function handleAbortTool(message: AbortToolMessage, sendResponse: (response: any) => void) {
  const { runId, stepId } = message.payload;
  const key = getToolExecutionKey(runId, stepId);
  const controller = activeToolControllers.get(key);
  if (controller) {
    controller.abort();
    activeToolControllers.delete(key);
  }
  sendResponse({ ok: true });
}

function buildIframePickPayload(iframe: HTMLIFrameElement): SelectedIframeTarget {
  let sameOrigin = false;
  try {
    sameOrigin = Boolean(iframe.contentDocument);
  } catch {
    sameOrigin = false;
  }

  return {
    elementId: getOrCreateElementId(iframe),
    selectorHint: iframe.id ? `#${iframe.id}` : undefined,
    rect: {
      x: iframe.getBoundingClientRect().x,
      y: iframe.getBoundingClientRect().y,
      width: iframe.getBoundingClientRect().width,
      height: iframe.getBoundingClientRect().height,
    },
    src: iframe.getAttribute('src') || iframe.src || undefined,
    name: iframe.getAttribute('name') || undefined,
    sameOrigin,
  };
}

function stopIframePicker() {
  cleanupIframePicker?.();
  cleanupIframePicker = null;
  clearHighlight();
}

function handleStartIframePicker(_message: StartIframePickerMessage, sendResponse: (response: any) => void) {
  stopIframePicker();

  const pickerOverlay = document.createElement('div');
  pickerOverlay.style.position = 'fixed';
  pickerOverlay.style.inset = '0';
  pickerOverlay.style.zIndex = '2147483646';
  pickerOverlay.style.cursor = 'crosshair';
  pickerOverlay.style.background = 'rgba(99,102,241,0.02)';
  pickerOverlay.style.pointerEvents = 'auto';

  const pickerLabel = document.createElement('div');
  pickerLabel.textContent = '点击要截图的 iframe，按 Esc 取消';
  pickerLabel.style.position = 'fixed';
  pickerLabel.style.top = '16px';
  pickerLabel.style.left = '50%';
  pickerLabel.style.transform = 'translateX(-50%)';
  pickerLabel.style.zIndex = '2147483647';
  pickerLabel.style.padding = '8px 12px';
  pickerLabel.style.borderRadius = '9999px';
  pickerLabel.style.background = 'rgba(17,24,39,0.92)';
  pickerLabel.style.color = '#fff';
  pickerLabel.style.fontSize = '12px';
  pickerLabel.style.fontWeight = '600';
  pickerLabel.style.pointerEvents = 'none';

  document.documentElement.appendChild(pickerOverlay);
  document.documentElement.appendChild(pickerLabel);

  const getIframeAtPoint = (clientX: number, clientY: number) => {
    pickerOverlay.style.pointerEvents = 'none';
    const target = document.elementFromPoint(clientX, clientY);
    pickerOverlay.style.pointerEvents = 'auto';
    return target instanceof HTMLIFrameElement ? target : null;
  };

  const handleMove = (event: MouseEvent) => {
    const iframe = getIframeAtPoint(event.clientX, event.clientY);
    if (!iframe) {
      clearHighlight();
      return;
    }
    showRectHighlight(iframe.getBoundingClientRect(), '点击以选择 iframe', 10_000);
  };

  const handleClick = (event: MouseEvent) => {
    const iframe = getIframeAtPoint(event.clientX, event.clientY);
    if (!iframe) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const payload = buildIframePickPayload(iframe);
    showRectHighlight(iframe.getBoundingClientRect(), payload.sameOrigin ? '已选择 iframe' : '跨域 iframe', 1500);
    chrome.runtime.sendMessage(createMessage('IFRAME_PICKED', payload) as IframePickedMessage, () => {
      if (chrome.runtime.lastError) {
        // noop
      }
    });
    stopIframePicker();
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      stopIframePicker();
    }
  };

  pickerOverlay.addEventListener('mousemove', handleMove, true);
  pickerOverlay.addEventListener('click', handleClick, true);
  window.addEventListener('keydown', handleKeydown, true);
  cleanupIframePicker = () => {
    pickerOverlay.removeEventListener('mousemove', handleMove, true);
    pickerOverlay.removeEventListener('click', handleClick, true);
    window.removeEventListener('keydown', handleKeydown, true);
    pickerOverlay.remove();
    pickerLabel.remove();
  };

  sendResponse({ ok: true });
}

function handleCancelIframePicker(_message: CancelIframePickerMessage, sendResponse: (response: any) => void) {
  stopIframePicker();
  sendResponse({ ok: true });
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

// 存储上次 URL 的 key（用于传统页面导航检测）
const LAST_URL_KEY = `${APP_NAME}_last_url`;

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
      // 更新存储的 URL
      try {
        sessionStorage.setItem(LAST_URL_KEY, currentUrl);
      } catch (e) {
        // 忽略 sessionStorage 错误（某些页面可能禁用）
      }
      
      console.log(`${APP_NAME}: 检测到路由变化，通知刷新页面内容`, currentUrl);
      
      // 通知 sidepanel 刷新
      chrome.runtime.sendMessage(
        createMessage('REFRESH_PAGE_CONTEXT', {}),
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn(`${APP_NAME}: 发送刷新消息失败:`, chrome.runtime.lastError.message);
          } else {
            console.log(`${APP_NAME}: 刷新消息已发送，响应:`, response);
          }
        }
      );
    }
  }, 500);
}

/**
 * 检查是否是页面首次加载（传统页面导航）
 */
function checkPageLoad() {
  try {
    const storedLastUrl = sessionStorage.getItem(LAST_URL_KEY);
    const currentUrl = location.href;
    
    if (storedLastUrl && storedLastUrl !== currentUrl) {
      // URL 变化了，说明是传统页面导航
      console.log(`${APP_NAME}: 检测到传统页面导航，从 ${storedLastUrl} 到 ${currentUrl}`);
      lastUrl = storedLastUrl; // 设置为上次的 URL，触发刷新
      notifyPageContextRefresh();
    } else if (!storedLastUrl) {
      // 首次加载，存储当前 URL
      sessionStorage.setItem(LAST_URL_KEY, currentUrl);
      lastUrl = currentUrl;
    } else {
      // URL 相同，更新 lastUrl
      lastUrl = currentUrl;
    }
  } catch (e) {
    // 忽略 sessionStorage 错误（某些页面可能禁用）
    console.warn(`${APP_NAME}: 无法访问 sessionStorage，跳过传统页面导航检测`);
    lastUrl = location.href;
  }
}

// 在页面加载完成后检查（传统页面导航）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // 延迟一点，确保 URL 已经更新
    setTimeout(checkPageLoad, 100);
  });
} else {
  // 如果已经加载完成，立即检查
  setTimeout(checkPageLoad, 100);
}

// 也监听 load 事件（确保所有资源加载完成）
window.addEventListener('load', () => {
  // 延迟一点，确保 URL 已经更新
  setTimeout(checkPageLoad, 100);
});

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
  stopIframePicker();
  selectionHandler.destroy();
  clearHighlight();
});
