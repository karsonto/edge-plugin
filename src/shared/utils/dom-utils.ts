/**
 * DOM 操作工具
 */

/**
 * 获取选中的文本
 */
export function getSelectedText(): string {
  const selection = window.getSelection();
  return selection ? selection.toString().trim() : '';
}

/**
 * 检查元素是否可见
 */
export function isElementVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * 查询元素
 */
export function querySelector<T extends Element = Element>(
  selector: string,
  context: Document | Element = document
): T | null {
  return context.querySelector<T>(selector);
}

/**
 * 查询所有元素
 */
export function querySelectorAll<T extends Element = Element>(
  selector: string,
  context: Document | Element = document
): T[] {
  return Array.from(context.querySelectorAll<T>(selector));
}

/**
 * 等待元素出现
 */
export function waitForElement<T extends Element = Element>(
  selector: string,
  timeout: number = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const element = querySelector<T>(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = querySelector<T>(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

/**
 * 获取页面元数据
 */
export function getPageMetadata() {
  const getMetaContent = (name: string): string | undefined => {
    const meta = 
      document.querySelector(`meta[name="${name}"]`) ||
      document.querySelector(`meta[property="${name}"]`) ||
      document.querySelector(`meta[property="og:${name}"]`);
    return meta?.getAttribute('content') || undefined;
  };

  return {
    title: document.title,
    description: getMetaContent('description'),
    author: getMetaContent('author'),
    publishDate: getMetaContent('article:published_time'),
    keywords: getMetaContent('keywords')?.split(',').map(k => k.trim()),
    language: document.documentElement.lang || undefined,
  };
}

/**
 * 解析 XPath 选择器
 */
export function resolveXPath(xpath: string, context: Document | Element = document): Element | null {
  try {
    const result = document.evaluate(
      xpath,
      context,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue as Element | null;
  } catch (error) {
    console.error('XPath evaluation error:', error);
    return null;
  }
}

/**
 * 解析所有匹配的 XPath 选择器
 */
export function resolveXPathAll(xpath: string, context: Document | Element = document): Element[] {
  try {
    const result = document.evaluate(
      xpath,
      context,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    const elements: Element[] = [];
    for (let i = 0; i < result.snapshotLength; i++) {
      const node = result.snapshotItem(i);
      if (node && node.nodeType === Node.ELEMENT_NODE) {
        elements.push(node as Element);
      }
    }
    return elements;
  } catch (error) {
    console.error('XPath evaluation error:', error);
    return [];
  }
}

/**
 * 解析选择器（支持 CSS 和 XPath）
 */
export function resolveSelector(
  selector: string,
  type: 'css' | 'xpath' = 'css',
  context: Document | Element = document
): Element | null {
  if (type === 'xpath') {
    return resolveXPath(selector, context);
  }
  
  try {
    return querySelector(selector, context);
  } catch (error) {
    // 检测常见的无效选择器模式
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('is not a valid selector') || errorMsg.includes('Invalid selector')) {
      // 检测 jQuery 伪选择器
      if (selector.includes(':contains(') || selector.includes(':has(') || 
          selector.includes(':first') || selector.includes(':last') ||
          selector.includes(':eq(') || selector.includes(':gt(') || selector.includes(':lt(')) {
        throw new Error(`Invalid selector: "${selector}". CSS does not support jQuery pseudo-selectors like :contains(), :has(), :first, :last, :eq(), :gt(), :lt(). Use XPath (selectorType: "xpath") or findByText tool instead.`);
      }
      throw new Error(`Invalid CSS selector: "${selector}". ${errorMsg}`);
    }
    throw error;
  }
}

/**
 * 解析所有匹配的选择器（支持 CSS 和 XPath）
 */
export function resolveSelectorAll(
  selector: string,
  type: 'css' | 'xpath' = 'css',
  context: Document | Element = document
): Element[] {
  if (type === 'xpath') {
    return resolveXPathAll(selector, context);
  }
  
  try {
    return querySelectorAll(selector, context);
  } catch (error) {
    // 检测常见的无效选择器模式
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('is not a valid selector') || errorMsg.includes('Invalid selector')) {
      // 检测 jQuery 伪选择器
      if (selector.includes(':contains(') || selector.includes(':has(') || 
          selector.includes(':first') || selector.includes(':last') ||
          selector.includes(':eq(') || selector.includes(':gt(') || selector.includes(':lt(')) {
        throw new Error(`Invalid selector: "${selector}". CSS does not support jQuery pseudo-selectors like :contains(), :has(), :first, :last, :eq(), :gt(), :lt(). Use XPath (selectorType: "xpath") or findByText tool instead.`);
      }
      throw new Error(`Invalid CSS selector: "${selector}". ${errorMsg}`);
    }
    throw error;
  }
}
