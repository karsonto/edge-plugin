/**
 * 全局常量定义
 */

/**
 * 存储键名
 */
export const STORAGE_KEYS = {
  CONFIG: 'edage_config',
  LAST_PAGE_CONTEXT: 'edage_last_page_context',
} as const;

/**
 * 消息超时时间（毫秒）
 */
export const MESSAGE_TIMEOUT = 30000;

/**
 * 最大内容长度（字符）
 */
export const MAX_CONTENT_LENGTH = 50000;

/**
 * 上下文压缩相关默认值
 */
export const DEFAULT_CONTEXT_WINDOW = 128000;
export const DEFAULT_INPUT_TOKEN_THRESHOLD = 100000;
export const DEFAULT_TOKEN_SAFETY_MARGIN = 4000;
export const DEFAULT_RECENT_RAW_MESSAGE_COUNT = 4;
export const DEFAULT_RECENT_TOOL_RESULT_COUNT = 1;
export const CONTINUITY_SUMMARY_MAX_TOKENS = 1200;

/**
 * OpenAI-compatible Chat Completions 默认端点
 */
export const API_ENDPOINTS = {
  OPENAI: 'https://api.openai.com/v1/chat/completions',
} as const;

/**
 * 模型选项
 */
export const MODEL_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  openai: [
    { value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo' },
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  ],
  custom: [
    { value: 'qwen3', label: 'Qwen3' },
    { value: 'custom', label: 'Custom Model' },
  ],
};

/**
 * 默认配置
 */
import type { AppConfig, QuickAction } from './types';

export const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'summarize',
    emoji: '📝',
    name: '总结文章',
    prompt: '请用 3-5 个要点总结以下内容的核心观点：\n\n{context}',
    order: 0,
  },
  {
    id: 'translate',
    emoji: '🌐',
    name: '翻译成英文',
    prompt: '请将以下内容翻译成英文：\n\n{context}',
    order: 1,
  },
  {
    id: 'explain',
    emoji: '💡',
    name: '解释概念',
    prompt: '请解释以下内容中的专业术语和关键概念：\n\n{context}',
    order: 2,
  },
  {
    id: 'extract',
    emoji: '❓',
    name: '提取要点',
    prompt: '请从以下内容中提取关键问题和要点：\n\n{context}',
    order: 3,
  },
];

export const DEFAULT_CONFIG: AppConfig = {
  ai: {
    provider: 'custom',
    apiKey: '',
    model: 'qwen3',
    temperature: 0.7,
    maxTokens: 65535,
    topP: 0.8,
    repetitionPenalty: 1.05,
    // Default OpenAI-compatible endpoint for "custom" provider.
    // You can override it at build time via VITE_DEFAULT_CUSTOM_ENDPOINT.
    customEndpoint:
      import.meta.env.VITE_DEFAULT_CUSTOM_ENDPOINT ||
      'http://localhost:8080/v1/chat/completions',
    enableFunctionCalling: false, // 历史字段名，当前用于控制浏览器自动化模式
  },
  quickActions: DEFAULT_QUICK_ACTIONS,
  ui: {
    theme: 'auto',
    fontSize: 'medium',
  },
  behavior: {
    autoCapture: true,
    showFloatingButton: true,
  },
  privacy: {
    excludeDomains: [],
  },
};

/**
 * 工具错误消息
 */
export const TOOL_ERRORS = {
  ELEMENT_NOT_FOUND: 'Element not found',
  INVALID_SELECTOR: 'Invalid selector',
  SELECTOR_TYPE_NOT_SUPPORTED: 'Selector type not supported',
  MISSING_REQUIRED_PARAM: 'Missing required parameter',
} as const;
