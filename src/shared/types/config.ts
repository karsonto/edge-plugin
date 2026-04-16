/**
 * 配置类型定义
 */

/**
 * 快捷操作配置
 */
export interface QuickAction {
  id: string;
  emoji: string;
  name: string;
  prompt: string;
  order?: number;
}

/**
 * AI 服务类型
 * - openai: OpenAI 官方 Chat Completions
 * - custom: 任意 OpenAI-compatible Chat Completions 端点
 */
export type AIProvider = 'openai' | 'custom';

/**
 * AI 配置
 */
export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  customEndpoint?: string;
  topP?: number;
  repetitionPenalty?: number;
  enableFunctionCalling?: boolean;  // 历史字段名，当前用于控制浏览器自动化模式
}

/**
 * 主题类型
 */
export type Theme = 'light' | 'dark' | 'auto';

/**
 * 字体大小
 */
export type FontSize = 'small' | 'medium' | 'large';

/**
 * UI 偏好设置
 */
export interface UIPreferences {
  theme: Theme;
  fontSize: FontSize;
}

/**
 * 行为设置
 */
export type DefaultPageCaptureStrategy = 'full' | 'readability';

export interface BehaviorSettings {
  autoCapture: boolean;
  showFloatingButton: boolean;
  defaultPageCaptureStrategy: DefaultPageCaptureStrategy;
}

/**
 * 隐私设置
 */
export interface PrivacySettings {
  excludeDomains: string[];
}

/**
 * 完整配置
 */
export interface AppConfig {
  ai: AIConfig;
  quickActions: QuickAction[];
  ui: UIPreferences;
  behavior: BehaviorSettings;
  privacy: PrivacySettings;
}
