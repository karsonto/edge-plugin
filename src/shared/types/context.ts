/**
 * 页面上下文类型定义
 */

/**
 * 页面元数据
 */
export interface PageMetadata {
  author?: string;
  publishDate?: string;
  description?: string;
  keywords?: string[];
  language?: string;
  wordCount?: number;
  readingTime?: number; // 预计阅读时间（分钟）
}

/**
 * 页面上下文
 */
export interface PageContext {
  title: string;
  url: string;
  content: string;
  selectedText?: string;
  metadata: PageMetadata;
  timestamp: number;
}

/**
 * 提取策略
 */
export type ExtractionStrategy = 
  | 'auto'      // 自动选择最佳策略
  | 'full'      // 全页面提取
  | 'main'      // 主要内容提取
  | 'selected'; // 用户选中的文本

/**
 * 文本提取选项
 */
export interface ExtractionOptions {
  strategy: ExtractionStrategy;
  maxLength?: number;
  includeMetadata?: boolean;
  cleanHTML?: boolean;
}
