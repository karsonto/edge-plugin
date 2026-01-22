/**
 * Network Request Tool - 网络请求工具
 * 
 * 功能:
 * - 从浏览器发送 HTTP 请求
 * - 携带浏览器 Cookie 和上下文
 * - 支持各种 HTTP 方法
 * - 支持 multipart/form-data 文件上传
 */

import { createErrorResponse, ToolResult } from '../core/tool-handler';
import { BaseBrowserToolExecutor } from '../core/base-browser';
import { TOOL_NAMES } from '../schemas/tool-schemas';

// Content Script 消息类型
const TOOL_MESSAGE_TYPES = {
  NETWORK_SEND_REQUEST: 'networkSendRequest',
};

const DEFAULT_NETWORK_REQUEST_TIMEOUT = 30000;

interface NetworkRequestToolParams {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  formData?: any;
}

/**
 * 网络请求工具
 * 
 * 通过 Content Script 发送请求，
 * 可以携带页面的 Cookie 和认证信息。
 */
class NetworkRequestTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.NETWORK_REQUEST;

  async execute(args: NetworkRequestToolParams): Promise<ToolResult> {
    const {
      url,
      method = 'GET',
      headers = {},
      body,
      timeout = DEFAULT_NETWORK_REQUEST_TIMEOUT,
    } = args;

    console.log(`NetworkRequestTool: Executing with options:`, args);

    if (!url) {
      return createErrorResponse('URL parameter is required.');
    }

    try {
      // 获取当前活动标签页
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]?.id) {
        return createErrorResponse('No active tab found or tab has no ID.');
      }
      const activeTabId = tabs[0].id;

      // 注入网络辅助脚本
      await this.injectContentScript(activeTabId, ['inject-scripts/network-helper.js']);

      console.log(
        `NetworkRequestTool: Sending to content script: URL=${url}, Method=${method}`,
      );

      // 发送请求
      const resultFromContentScript = await this.sendMessageToTab(activeTabId, {
        action: TOOL_MESSAGE_TYPES.NETWORK_SEND_REQUEST,
        url: url,
        method: method,
        headers: headers,
        body: body,
        formData: args.formData || null,
        timeout: timeout,
      });

      console.log(`NetworkRequestTool: Response from content script:`, resultFromContentScript);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(resultFromContentScript),
          },
        ],
        isError: !resultFromContentScript?.success,
      };
    } catch (error: any) {
      console.error('NetworkRequestTool: Error sending network request:', error);
      return createErrorResponse(
        `Error sending network request: ${error.message || String(error)}`,
      );
    }
  }
}

export const networkRequestTool = new NetworkRequestTool();
