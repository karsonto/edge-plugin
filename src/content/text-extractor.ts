/**
 * 文本提取模块
 */

import type { PageContext, ExtractionStrategy, PageMetadata } from '@/shared/types';
import {
  extractAllVisibleText,
  extractMainContent,
  countWords,
  estimateReadingTime,
} from '@/shared/utils/text-processor';
import { getPageMetadata, getSelectedText } from '@/shared/utils/dom-utils';

/**
 * 提取页面上下文
 */
export function extractPageContext(
  strategy: ExtractionStrategy = 'auto'
): PageContext {
  let content = '';
  let selectedText: string | undefined;

  switch (strategy) {
    case 'selected':
      selectedText = getSelectedText();
      content = selectedText || extractMainContent();
      break;
    
    case 'full':
      // 使用“可见文字”提取，避免大量隐藏/无意义文本；并支持 Shadow DOM/同源 iframe
      content = extractAllVisibleText(document);
      selectedText = getSelectedText();
      break;
    
    case 'main':
      content = extractMainContent();
      selectedText = getSelectedText();
      break;
    
    case 'auto':
    default:
      selectedText = getSelectedText();
      content = selectedText || extractMainContent();
      break;
  }

  const metadata = extractMetadata(content);

  return {
    title: document.title,
    url: window.location.href,
    content,
    selectedText: selectedText || undefined,
    metadata,
    timestamp: Date.now(),
  };
}

/**
 * 提取页面元数据
 */
function extractMetadata(content: string): PageMetadata {
  const pageMeta = getPageMetadata();
  const wordCount = countWords(content);
  const readingTime = estimateReadingTime(content);

  return {
    author: pageMeta.author,
    publishDate: pageMeta.publishDate,
    description: pageMeta.description,
    keywords: pageMeta.keywords,
    language: pageMeta.language,
    wordCount,
    readingTime,
  };
}

/**
 * 监听文本选择事件
 */
export function watchTextSelection(
  callback: (text: string) => void
): () => void {
  const handleSelection = () => {
    const selected = getSelectedText();
    if (selected) {
      callback(selected);
    }
  };

  document.addEventListener('mouseup', handleSelection);
  document.addEventListener('keyup', handleSelection);

  // 返回清理函数
  return () => {
    document.removeEventListener('mouseup', handleSelection);
    document.removeEventListener('keyup', handleSelection);
  };
}
