/**
 * Accessibility Tree Helper - 可访问性树辅助脚本
 * 
 * 注入到页面中构建可访问性树
 * 功能:
 * - 遍历 DOM 构建可访问性树
 * - 为元素分配 ref_* 标识符
 * - 支持过滤交互元素
 * - 支持 iframe 遍历
 */

if (window.__ACCESSIBILITY_TREE_HELPER_INITIALIZED__) {
  // 已初始化，跳过
} else {
  window.__ACCESSIBILITY_TREE_HELPER_INITIALIZED__ = true;

  // 元素引用映射 (使用 WeakRef 避免内存泄漏)
  window.__claudeElementMap = window.__claudeElementMap || {};

  let refCounter = 0;

  /**
   * 生成可访问性树
   * @param {Object} options - 选项
   * @param {string} options.filter - 过滤器 ('interactive' 或 null)
   * @param {number} options.depth - 最大深度
   * @param {string} options.refId - 聚焦的 ref ID
   */
  function generateAccessibilityTree(options = {}) {
    const { filter, depth, refId } = options;
    const startTime = performance.now();
    
    // 清空旧的映射
    window.__claudeElementMap = {};
    refCounter = 0;

    const lines = [];
    let processedCount = 0;
    let includedCount = 0;

    // 获取视口信息
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    };

    // 交互元素标签
    const interactiveTags = new Set([
      'A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA',
      'LABEL', 'DETAILS', 'SUMMARY',
    ]);

    // 交互 role
    const interactiveRoles = new Set([
      'button', 'link', 'menuitem', 'tab', 'checkbox', 'radio',
      'textbox', 'combobox', 'listbox', 'option', 'slider',
      'switch', 'searchbox', 'spinbutton',
    ]);

    /**
     * 检查元素是否在视口内
     */
    function isInViewport(el) {
      const rect = el.getBoundingClientRect();
      return (
        rect.bottom >= 0 &&
        rect.right >= 0 &&
        rect.top <= viewport.height &&
        rect.left <= viewport.width &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    /**
     * 检查元素是否是交互元素
     */
    function isInteractive(el) {
      if (interactiveTags.has(el.tagName)) return true;
      const role = el.getAttribute('role');
      if (role && interactiveRoles.has(role)) return true;
      if (el.hasAttribute('onclick') || el.hasAttribute('tabindex')) return true;
      if (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false') return true;
      return false;
    }

    /**
     * 获取元素的可访问名称
     */
    function getAccessibleName(el) {
      // aria-label
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel.trim();

      // aria-labelledby
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) return labelEl.textContent?.trim() || '';
      }

      // label for input
      if (el.id && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) return label.textContent?.trim() || '';
      }

      // alt for images
      if (el.tagName === 'IMG') {
        return el.alt || '';
      }

      // title
      if (el.title) return el.title.trim();

      // placeholder
      if (el.placeholder) return el.placeholder.trim();

      // text content (limited)
      const text = el.textContent?.trim() || '';
      return text.slice(0, 100);
    }

    /**
     * 获取元素类型描述
     */
    function getElementType(el) {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role');
      
      if (role) return role;
      if (tag === 'a') return 'link';
      if (tag === 'button') return 'button';
      if (tag === 'input') return el.type || 'text';
      if (tag === 'select') return 'combobox';
      if (tag === 'textarea') return 'textbox';
      if (tag === 'img') return 'image';
      
      return tag;
    }

    /**
     * 遍历 DOM 树
     */
    function traverse(el, currentDepth = 0, indent = '') {
      if (depth !== undefined && currentDepth > depth) return;
      
      processedCount++;

      // 跳过不可见元素
      if (!isInViewport(el)) return;

      // 检查样式可见性
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;

      // 过滤非交互元素
      const interactive = isInteractive(el);
      if (filter === 'interactive' && !interactive) {
        // 继续遍历子元素
        for (const child of el.children) {
          traverse(child, currentDepth + 1, indent);
        }
        return;
      }

      // 分配 ref
      const ref = `ref_${++refCounter}`;
      window.__claudeElementMap[ref] = new WeakRef(el);

      // 获取元素信息
      const type = getElementType(el);
      const name = getAccessibleName(el);
      const rect = el.getBoundingClientRect();

      // 构建输出行
      let line = `${indent}- ${type}`;
      if (name) line += ` "${name}"`;
      line += ` ${ref}`;
      
      // 添加位置信息 (对于交互元素)
      if (interactive) {
        line += ` (x=${Math.round(rect.left + rect.width/2)},y=${Math.round(rect.top + rect.height/2)})`;
      }

      lines.push(line);
      includedCount++;

      // 遍历子元素
      for (const child of el.children) {
        traverse(child, currentDepth + 1, indent + '  ');
      }
    }

    // 如果指定了 refId，从该元素开始
    let startElement = document.body;
    if (refId) {
      const weak = window.__claudeElementMap[refId];
      const el = weak && typeof weak.deref === 'function' ? weak.deref() : null;
      if (el) {
        startElement = el;
      } else {
        return {
          success: false,
          error: `refId "${refId}" not found or expired`,
        };
      }
    }

    // 开始遍历
    traverse(startElement);

    const endTime = performance.now();

    return {
      success: true,
      pageContent: lines.join('\n'),
      viewport,
      stats: {
        processed: processedCount,
        included: includedCount,
        durationMs: Math.round(endTime - startTime),
      },
      refMap: Object.keys(window.__claudeElementMap),
    };
  }

  /**
   * 解析 ref 获取元素信息
   */
  function resolveRef(ref) {
    const weak = window.__claudeElementMap[ref];
    const el = weak && typeof weak.deref === 'function' ? weak.deref() : null;
    
    if (!el) {
      return { success: false, error: `ref "${ref}" not found` };
    }

    const rect = el.getBoundingClientRect();
    return {
      success: true,
      center: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      },
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      tagName: el.tagName,
      id: el.id || null,
    };
  }

  /**
   * 聚焦并滚动到 ref 元素
   */
  function focusByRef(ref) {
    const weak = window.__claudeElementMap[ref];
    const el = weak && typeof weak.deref === 'function' ? weak.deref() : null;
    
    if (!el) {
      return { success: false, error: `ref "${ref}" not found` };
    }

    el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
    if (typeof el.focus === 'function') {
      el.focus();
    }
    
    return { success: true };
  }

  // 监听来自扩展的消息
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'generateAccessibilityTree') {
      const result = generateAccessibilityTree({
        filter: request.filter,
        depth: request.depth,
        refId: request.refId,
      });
      sendResponse(result);
      return false;
    }
    
    if (request.action === 'resolveRef') {
      sendResponse(resolveRef(request.ref));
      return false;
    }

    if (request.action === 'focusByRef') {
      sendResponse(focusByRef(request.ref));
      return false;
    }

    if (request.action === 'chrome_read_page_ping') {
      sendResponse({ status: 'pong' });
      return false;
    }
  });
}
