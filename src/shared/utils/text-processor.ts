/**
 * 文本处理工具
 */

import { MAX_CONTENT_LENGTH } from '../constants';

/**
 * 清理 HTML 标签
 */
export function stripHTML(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

/**
 * 清理和规范化文本
 */
export function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')           // 多个空格替换为单个
    .replace(/\n{3,}/g, '\n\n')     // 多个换行替换为两个
    .trim();
}

/**
 * 截断文本
 */
export function truncateText(
  text: string,
  maxLength: number = MAX_CONTENT_LENGTH
): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '...';
}

/**
 * 计算字数
 */
export function countWords(text: string): number {
  // 中英文混合计数
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
  const englishWords = text.match(/[a-zA-Z]+/g) || [];
  return chineseChars.length + englishWords.length;
}

/**
 * 估算阅读时间（分钟）
 */
export function estimateReadingTime(text: string): number {
  const wordCount = countWords(text);
  // 假设中文 300 字/分钟，英文 200 词/分钟
  const readingSpeed = 250;
  return Math.ceil(wordCount / readingSpeed);
}

/**
 * 替换提示词模板中的占位符
 */
export function replacePlaceholders(
  template: string,
  context: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(context)) {
    const placeholder = `{${key}}`;
    result = result.replace(new RegExp(placeholder, 'g'), value);
  }
  return result;
}

/**
 * 提取主要内容（简化版 Readability 算法）
 */
export function extractMainContent(doc: Document = document): string {
  // 移除不需要的元素
  const excludeSelectors = [
    'script',
    'style',
    'nav',
    'header',
    'footer',
    'aside',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="complementary"]',
    '.sidebar',
    '.menu',
    '.navigation',
    '.advertisement',
    '.ad',
  ];

  const clone = doc.cloneNode(true) as Document;
  excludeSelectors.forEach(selector => {
    clone.querySelectorAll(selector).forEach(el => el.remove());
  });

  // 尝试查找主要内容区域
  const mainSelectors = [
    'article',
    '[role="main"]',
    'main',
    '.article',
    '.post',
    '.content',
    '#content',
  ];

  let mainContent: Element | null = null;
  for (const selector of mainSelectors) {
    mainContent = clone.querySelector(selector);
    if (mainContent) break;
  }

  // 如果没有找到主要内容区域，使用 body
  const content = mainContent || clone.body;
  
  // 提取文本并清理
  const text = content.textContent || '';
  return cleanText(text);
}

/**
 * 提取页面"可见文字"（更适合 SPA/后台系统页面）
 * - 过滤 script/style 等非内容节点
 * - 尽量忽略隐藏元素（display:none / visibility:hidden / hidden / aria-hidden）
 * - 递归提取 Shadow DOM
 * - 递归提取多层嵌套的同源 iframe（跨域 iframe 受浏览器安全限制无法读取）
 */
export function extractAllVisibleText(doc: Document = document): string {
  const EXCLUDE_TAGS = new Set([
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'SVG',
    'CANVAS',
    'OBJECT',
    'EMBED',
    // 注意：不在这里排除 IFRAME，改为在 walkRoot 中递归处理
  ]);

  const texts: string[] = [];
  
  // 用于防止循环引用（虽然理论上不太可能，但加一层保护）
  const processedDocs = new WeakSet<Document | ShadowRoot>();

  const isVisibleElement = (el: Element): boolean => {
    const htmlEl = el as HTMLElement;
    if (htmlEl.hasAttribute('hidden')) return false;
    if (htmlEl.getAttribute('aria-hidden') === 'true') return false;

    const view = htmlEl.ownerDocument.defaultView;
    const style = view?.getComputedStyle(htmlEl);
    if (!style) return true;
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (style.opacity === '0') return false;
    return true;
  };

  const walkRoot = (root: Document | ShadowRoot) => {
    // 防止重复处理同一个文档（循环引用保护）
    if (processedDocs.has(root)) return;
    processedDocs.add(root);

    // 提取文本节点
    const treeWalker = document.createTreeWalker(
      root as unknown as Node,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node: Node) {
          const parent = (node as Text).parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (EXCLUDE_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (!isVisibleElement(parent)) return NodeFilter.FILTER_REJECT;
          const t = (node.nodeValue || '').trim();
          if (!t) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    let n: Node | null = treeWalker.nextNode();
    while (n) {
      const t = (n.nodeValue || '').trim();
      if (t) texts.push(t);
      n = treeWalker.nextNode();
    }

    // 遍历元素，递归处理 Shadow DOM 和 iframe
    const elementWalker = document.createTreeWalker(
      root as unknown as Node,
      NodeFilter.SHOW_ELEMENT
    );
    let e: Node | null = elementWalker.nextNode();
    while (e) {
      const el = e as Element & { shadowRoot?: ShadowRoot | null };
      
      // 递归处理 Shadow DOM
      if (el.shadowRoot) {
        walkRoot(el.shadowRoot);
      }
      
      // 递归处理 iframe（支持多层嵌套）
      if (el.tagName === 'IFRAME') {
        try {
          const iframe = el as HTMLIFrameElement;
          const childDoc = iframe.contentDocument;
          if (childDoc) {
            console.log('[iframe] 抓取嵌套 iframe:', iframe.src || iframe.name || '(匿名 iframe)');
            walkRoot(childDoc);  // 递归调用，会自动处理 iframe 内部的 iframe
          }
        } catch (err) {
          // 跨域 iframe 无法访问，静默忽略
          const iframe = el as HTMLIFrameElement;
          console.warn('[iframe] 跨域 iframe 无法访问:', iframe.src || iframe.name);
        }
      }
      
      e = elementWalker.nextNode();
    }
  };

  // 从主文档开始递归抓取
  walkRoot(doc);

  return cleanText(texts.join('\n'));
}