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
