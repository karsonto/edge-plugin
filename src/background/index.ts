/**
 * Background Service Worker 入口
 */

import { handleMessage } from './message-handler';
import { storageManager } from './storage-manager';
import { APP_NAME } from '@/shared/brand';

console.log(`${APP_NAME} background service worker loaded`);

// 监听安装事件
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details.reason);
  
  if (details.reason === 'install') {
    // 首次安装，初始化默认配置
    storageManager.saveConfig({}).then(() => {
      console.log('Default config initialized');
    });
  }
});

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // handleMessage 返回 Promise<boolean>
  // 对于 REFRESH_PAGE_CONTEXT，返回 false 让消息继续传递到 sidepanel
  handleMessage(message, sender, sendResponse).catch((error) => {
    console.error('Error in handleMessage:', error);
  });
  // 对于需要异步响应的消息，返回 true
  // 对于 REFRESH_PAGE_CONTEXT，返回 false 让消息传递到 sidepanel
  // 但由于 handleMessage 是异步的，我们需要先检查消息类型
  if ((message as any)?.type === 'REFRESH_PAGE_CONTEXT') {
    return false; // 不拦截，让消息传递到 sidepanel
  }
  return true; // 默认保持消息通道开启（异步响应）
});

// 监听插件图标点击
chrome.action.onClicked.addListener(async (tab) => {
  // 打开侧边栏
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

// 监听快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-edage') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  }
});

// 监听存储变化
storageManager.onStorageChanged((changes) => {
  console.log('Storage changed:', Object.keys(changes));
});
