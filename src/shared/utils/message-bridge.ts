/**
 * 消息通信桥接工具
 * 简化 Chrome Extension 消息传递
 */

import type { Message, MessageType } from '../types';

/**
 * 发送消息到 background
 */
export async function sendToBackground<T = any>(
  message: Message
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * 发送消息到当前标签页的 content script
 */
export async function sendToContentScript<T = any>(
  message: Message,
  tabId?: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const targetTabId = tabId;
    
    if (targetTabId) {
      chrome.tabs.sendMessage(targetTabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        } else {
          reject(new Error('No active tab found'));
        }
      });
    }
  });
}

/**
 * 监听消息
 */
export function onMessage(
  callback: (
    message: Message,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ) => void | boolean
) {
  chrome.runtime.onMessage.addListener(callback);
}

/**
 * 生成唯一消息 ID
 */
export function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 创建消息
 */
export function createMessage<T extends MessageType>(
  type: T,
  payload?: any
): Message {
  return {
    type,
    id: generateMessageId(),
    timestamp: Date.now(),
    ...(payload && { payload }),
  } as Message;
}
