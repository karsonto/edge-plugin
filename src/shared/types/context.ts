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

export interface ExtractedPageDocument {
  id: string;
  title?: string;
  url?: string;
  role: 'main' | 'iframe' | 'supplement' | 'selected' | 'pdf';
  sourceType: 'main-document' | 'iframe' | 'shadow-dom' | 'visible-text' | 'selection' | 'pdf';
  format: 'text' | 'markdown';
  order: number;
  content: string;
}

export interface PageExtractionInfo {
  strategy: ExtractionStrategy;
  outputFormat: 'text' | 'markdown';
  version: string;
  fusionMethod?: 'single' | 'readability-merge' | 'pdf';
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
  documents?: ExtractedPageDocument[];
  extraction?: PageExtractionInfo;
}

/**
 * 提取策略
 */
export type ExtractionStrategy = 
  | 'auto'      // 自动选择最佳策略
  | 'full'      // 全页面提取
  | 'main'      // 主要内容提取
  | 'selected'  // 用户选中的文本
  | 'readability'; // Readability + Markdown 提取

/**
 * 文本提取选项
 */
export interface ExtractionOptions {
  strategy: ExtractionStrategy;
  maxLength?: number;
  includeMetadata?: boolean;
  cleanHTML?: boolean;
}
