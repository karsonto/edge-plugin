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
 * API 端点
 */
export const API_ENDPOINTS = {
  OPENAI: 'https://api.openai.com/v1/chat/completions',
  ANTHROPIC: 'https://api.anthropic.com/v1/messages',
  GEMINI: 'https://generativelanguage.googleapis.com/v1/models',
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
  anthropic: [
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
    { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
    { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
  ],
  gemini: [
    { value: 'gemini-pro', label: 'Gemini Pro' },
    { value: 'gemini-ultra', label: 'Gemini Ultra' },
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
