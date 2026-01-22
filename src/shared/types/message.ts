/**
 * 消息类型定义
 * 用于 content script <-> background <-> sidepanel 之间的通信
 */

import type { AIConfig } from './config';
import type { AutomationRunState, ConfirmationRequestPayload, ConfirmationResponsePayload, ToolCall, ToolResult } from './automation';

export type MessageType =
  | 'GET_PAGE_CONTEXT'        // 获取页面内容
  | 'PAGE_CONTEXT_RESPONSE'   // 页面内容响应
  | 'SEND_TO_AI'              // 发送消息到 AI
  | 'AI_RESPONSE_START'       // AI 响应开始
  | 'AI_RESPONSE_CHUNK'       // AI 响应片段（流式）
  | 'AI_RESPONSE_END'         // AI 响应结束
  | 'AI_RESPONSE_ERROR'       // AI 响应错误
  | 'RUN_AUTOMATION'          // 启动一次自动化运行（Browser Use）
  | 'STOP_AUTOMATION'         // 停止自动化运行
  | 'AUTOMATION_STATUS'       // 自动化状态/步骤更新
  | 'EXECUTE_TOOL'            // background -> content 执行工具
  | 'TOOL_RESULT'             // content -> background 工具执行结果
  | 'REQUEST_CONFIRMATION'    // 请求用户确认（高风险动作）
  | 'CONFIRMATION_RESPONSE'   // 用户确认结果
  | 'LOAD_AUTOMATION_HISTORY' // 加载自动化历史
  | 'AUTOMATION_HISTORY_RESPONSE' // 自动化历史响应
  | 'SAVE_SETTINGS'           // 保存设置
  | 'LOAD_SETTINGS'           // 加载设置
  | 'SETTINGS_RESPONSE'       // 设置响应
  | 'TAKE_SCREENSHOT'         // 截图请求
  | 'DOWNLOAD_FILE'           // 下载文件请求
  | 'REFRESH_PAGE_CONTEXT'   // 通知 sidepanel 刷新页面内容
  | 'EXECUTE_BACKGROUND_TOOL'; // 执行需要在 background 执行的工具

export interface BaseMessage {
  type: MessageType;
  id?: string;
  timestamp?: number;
}

export interface GetPageContextMessage extends BaseMessage {
  type: 'GET_PAGE_CONTEXT';
  payload?: {
    /**
     * 目标标签页 ID。
     * 注意：sidepanel 通过 runtime.sendMessage 发到 background 时，sender.tab 可能为空；
     * 这时需要显式传 tabId，让 background 能正确转发到 content script。
     */
    tabId?: number;
  };
}

export interface PageContextResponseMessage extends BaseMessage {
  type: 'PAGE_CONTEXT_RESPONSE';
  payload: {
    title: string;
    url: string;
    content: string;
    selectedText?: string;
    metadata?: {
      author?: string;
      publishDate?: string;
      wordCount?: number;
    };
  };
}

export interface SendToAIMessage extends BaseMessage {
  type: 'SEND_TO_AI';
  payload: {
    messages: ChatMessage[];
    settings: AIConfig;
  };
}

export interface AIResponseStartMessage extends BaseMessage {
  type: 'AI_RESPONSE_START';
  payload: {
    messageId: string;
  };
}

export interface AIResponseChunkMessage extends BaseMessage {
  type: 'AI_RESPONSE_CHUNK';
  payload: {
    messageId: string;
    chunk: string;
  };
}

export interface AIResponseEndMessage extends BaseMessage {
  type: 'AI_RESPONSE_END';
  payload: {
    messageId: string;
  };
}

export interface AIResponseErrorMessage extends BaseMessage {
  type: 'AI_RESPONSE_ERROR';
  payload: {
    messageId: string;
    error: string;
    errorCode?: string;
  };
}

export interface RunAutomationMessage extends BaseMessage {
  type: 'RUN_AUTOMATION';
  payload: {
    tabId: number;
    goal: string;
    /**
     * 可选：给模型的额外上下文（例如页面抓取内容）
     */
    context?: string;
  };
}

export interface StopAutomationMessage extends BaseMessage {
  type: 'STOP_AUTOMATION';
  payload: {
    runId: string;
  };
}

export interface AutomationStatusMessage extends BaseMessage {
  type: 'AUTOMATION_STATUS';
  payload: AutomationRunState;
}

export interface ExecuteToolMessage extends BaseMessage {
  type: 'EXECUTE_TOOL';
  payload: {
    runId: string;
    stepId: string;
    call: ToolCall;
  };
}

export interface ToolResultMessage extends BaseMessage {
  type: 'TOOL_RESULT';
  payload: {
    runId: string;
    stepId: string;
    result: ToolResult;
  };
}

export interface RequestConfirmationMessage extends BaseMessage {
  type: 'REQUEST_CONFIRMATION';
  payload: ConfirmationRequestPayload;
}

export interface ConfirmationResponseMessage extends BaseMessage {
  type: 'CONFIRMATION_RESPONSE';
  payload: ConfirmationResponsePayload;
}

export interface LoadAutomationHistoryMessage extends BaseMessage {
  type: 'LOAD_AUTOMATION_HISTORY';
}

export interface AutomationHistoryResponseMessage extends BaseMessage {
  type: 'AUTOMATION_HISTORY_RESPONSE';
  payload: AutomationRunState[];
}

export interface SaveSettingsMessage extends BaseMessage {
  type: 'SAVE_SETTINGS';
  payload: any;
}

export interface LoadSettingsMessage extends BaseMessage {
  type: 'LOAD_SETTINGS';
}

export interface SettingsResponseMessage extends BaseMessage {
  type: 'SETTINGS_RESPONSE';
  payload: any;
}

export interface TakeScreenshotMessage extends BaseMessage {
  type: 'TAKE_SCREENSHOT';
  payload: {
    screenshotType: 'visible' | 'fullpage';
    format: 'png' | 'jpeg';
    quality: number;
    download: boolean;
    filename: string;
    elementRect?: { x: number; y: number; width: number; height: number };
    pageInfo?: {
      scrollHeight: number;
      scrollWidth: number;
      viewportHeight: number;
      viewportWidth: number;
      currentScrollY: number;
      currentScrollX: number;
    };
  };
}

export interface DownloadFileMessage extends BaseMessage {
  type: 'DOWNLOAD_FILE';
  payload: {
    url?: string;
    content?: string;
    filename?: string;
    contentType?: string;
  };
}

export interface ExecuteBackgroundToolMessage extends BaseMessage {
  type: 'EXECUTE_BACKGROUND_TOOL';
  payload: {
    tool: string;
    args: any;
  };
}

export interface RefreshPageContextMessage extends BaseMessage {
  type: 'REFRESH_PAGE_CONTEXT';
  payload?: {};
}

export type Message =
  | GetPageContextMessage
  | PageContextResponseMessage
  | SendToAIMessage
  | AIResponseStartMessage
  | AIResponseChunkMessage
  | AIResponseEndMessage
  | AIResponseErrorMessage
  | RunAutomationMessage
  | StopAutomationMessage
  | AutomationStatusMessage
  | ExecuteToolMessage
  | ToolResultMessage
  | RequestConfirmationMessage
  | ConfirmationResponseMessage
  | LoadAutomationHistoryMessage
  | AutomationHistoryResponseMessage
  | SaveSettingsMessage
  | LoadSettingsMessage
  | SettingsResponseMessage
  | TakeScreenshotMessage
  | DownloadFileMessage
  | ExecuteBackgroundToolMessage
  | RefreshPageContextMessage;

/**
 * 聊天消息类型
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  timestamp?: number;
  // Function Calling 相关字段
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;  // 用于 role='tool' 的消息
  name?: string;  // 工具名称
  id?: string;  // 消息唯一 ID
}
