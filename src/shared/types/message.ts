/**
 * 消息类型定义
 * 用于 content script <-> background <-> sidepanel 之间的通信
 */

import type { AIConfig } from './config';
import type { SelectedIframeTarget, ToolCall, ToolResult } from './automation';

export type MessageType =
  | 'GET_PAGE_CONTEXT'        // 获取页面内容
  | 'PAGE_CONTEXT_RESPONSE'   // 页面内容响应
  | 'SEND_TO_AI'              // 发送消息到 AI
  | 'AI_RESPONSE_START'       // AI 响应开始
  | 'AI_RESPONSE_CHUNK'       // AI 响应片段（流式）
  | 'AI_RESPONSE_END'         // AI 响应结束
  | 'AI_RESPONSE_ERROR'       // AI 响应错误
  | 'ABORT_AI'               // 中断正在进行的 AI 流式请求
  | 'EXECUTE_TOOL'            // background -> content 执行工具
  | 'ABORT_TOOL'              // 终止正在执行的工具
  | 'TOOL_RESULT'             // content -> background 工具执行结果
  | 'CAPTURE_VISIBLE_TAB'     // content -> background 捕获当前视口截图
  | 'START_IFRAME_PICKER'     // sidepanel -> content 开始点选 iframe
  | 'CANCEL_IFRAME_PICKER'    // sidepanel -> content 取消点选 iframe
  | 'IFRAME_PICKED'           // content -> sidepanel 已选择 iframe
  | 'SAVE_SETTINGS'           // 保存设置
  | 'LOAD_SETTINGS'           // 加载设置
  | 'SETTINGS_RESPONSE'       // 设置响应
  | 'REFRESH_PAGE_CONTEXT';   // 通知 sidepanel 刷新页面内容

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

export interface AbortAIMessage extends BaseMessage {
  type: 'ABORT_AI';
  payload: {
    messageId: string;
  };
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

export interface AbortToolMessage extends BaseMessage {
  type: 'ABORT_TOOL';
  payload: {
    runId: string;
    stepId: string;
  };
}

export interface CaptureVisibleTabMessage extends BaseMessage {
  type: 'CAPTURE_VISIBLE_TAB';
  payload?: {
    format?: 'png' | 'jpeg';
    quality?: number;
  };
}

export interface StartIframePickerMessage extends BaseMessage {
  type: 'START_IFRAME_PICKER';
}

export interface CancelIframePickerMessage extends BaseMessage {
  type: 'CANCEL_IFRAME_PICKER';
}

export interface IframePickedMessage extends BaseMessage {
  type: 'IFRAME_PICKED';
  payload: SelectedIframeTarget;
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
  | AbortAIMessage
  | ExecuteToolMessage
  | AbortToolMessage
  | ToolResultMessage
  | CaptureVisibleTabMessage
  | StartIframePickerMessage
  | CancelIframePickerMessage
  | IframePickedMessage
  | SaveSettingsMessage
  | LoadSettingsMessage
  | SettingsResponseMessage
  | RefreshPageContextMessage;

/**
 * 聊天消息类型
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  timestamp?: number;
  // 工具调用相关字段
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
