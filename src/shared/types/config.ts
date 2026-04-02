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
 * AI 提供商类型
 */
export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'custom';

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
export interface BehaviorSettings {
  autoCapture: boolean;
  showFloatingButton: boolean;
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

/**
 * 默认配置
 */
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
    provider: 'openai',
    apiKey: '',
    model: 'gpt-4-turbo-preview',
    temperature: 0.7,
    maxTokens: 65535,
    enableFunctionCalling: false,  // 默认关闭浏览器自动化模式
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
