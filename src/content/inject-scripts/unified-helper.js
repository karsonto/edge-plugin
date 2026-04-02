/**
 * Unified Helper - 统一浏览器操作辅助脚本
 * 
 * 整合了 accessibility-tree-helper、click-helper、fill-helper 的功能
 * 提供统一的注入脚本接口，支持：
 * - readPage: 生成可访问性树，支持元素查找
 * - interact: 交互操作（点击、悬停、滚动、键盘按键）
 * - fill: 表单填充
 */

if (window.__UNIFIED_HELPER_INITIALIZED__) {
  // 已初始化，跳过
} else {
  window.__UNIFIED_HELPER_INITIALIZED__ = true;

  // 元素引用映射 (使用 WeakRef 避免内存泄漏)
  window.__claudeElementMap = window.__claudeElementMap || {};

  let refCounter = 0;

  // ============================================
  // Accessibility Tree Helper 功能
  // ============================================

  /**
   * 生成可访问性树
   * @param {Object} options - 选项
   * @param {string} options.filter - 过滤器 ('interactive' 或 null)
   * @param {number} options.depth - 最大深度
   * @param {string} options.refId - 聚焦的 ref ID
   * @param {string} options.selector - CSS 选择器或 XPath（可选，用于过滤）
   * @param {string} options.selectorType - 选择器类型 ('css' 或 'xpath')
   * @param {string} options.text - 按文本查找（可选）
   * @param {string} options.role - 限定元素角色（可选，与 text 配合使用）
   */
  function generateAccessibilityTree(options = {}) {
    const { filter, depth, refId, selector, selectorType, text, role } = options;
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
      const roleAttr = el.getAttribute('role');
      if (roleAttr && interactiveRoles.has(roleAttr)) return true;
      if (el.hasAttribute('onclick') || el.hasAttribute('tabindex')) return true;
      if (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false') return true;
      return false;
    }

    /**
     * 检查元素是否可见
     */
    function isElementVisible(el) {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight ||
          rect.right < 0 || rect.left > window.innerWidth) {
        return false;
      }
      return true;
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
      const textContent = el.textContent?.trim() || '';
      return textContent.slice(0, 100);
    }

    /**
     * 获取元素类型描述
     */
    function getElementType(el) {
      const tag = el.tagName.toLowerCase();
      const roleAttr = el.getAttribute('role');
      
      if (roleAttr) return roleAttr;
      if (tag === 'a') return 'link';
      if (tag === 'button') return 'button';
      if (tag === 'input') return el.type || 'text';
      if (tag === 'select') return 'combobox';
      if (tag === 'textarea') return 'textbox';
      if (tag === 'img') return 'image';
      
      return tag;
    }

    /**
     * 获取标签文本（用于 findByText）
     */
    function getLabelText(el) {
      const ariaLabelledBy = (el.getAttribute('aria-labelledby') || '').trim();
      if (ariaLabelledBy) {
        const ids = ariaLabelledBy.split(/\s+/).filter(Boolean);
        const t = ids
          .map((id) => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (t) return t.slice(0, 120);
      }

      const id = el.getAttribute('id');
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        const t = (label?.innerText || label?.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) return t.slice(0, 120);
      }

      const wrapLabel = el.closest('label');
      if (wrapLabel) {
        const t = ((wrapLabel).innerText || wrapLabel.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) return t.slice(0, 120);
      }

      return undefined;
    }

    /**
     * 检查元素是否类似按钮
     */
    function isButtonLike(el) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'button') return true;
      if (tag === 'a') return true;
      if (tag === 'input') {
        const t = el.type?.toLowerCase();
        return t === 'button' || t === 'submit' || t === 'reset';
      }
      return el.getAttribute('role') === 'button';
    }

    /**
     * 使用选择器查找元素
     */
    function queryElements(sel, selType) {
      if (selType === 'xpath') {
        const result = document.evaluate(sel, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        const elements = [];
        for (let i = 0; i < result.snapshotLength; i++) {
          const node = result.snapshotItem(i);
          if (node.nodeType === Node.ELEMENT_NODE && isElementVisible(node)) {
            elements.push(node);
          }
        }
        return elements;
      } else {
        try {
          return Array.from(document.querySelectorAll(sel)).filter(isElementVisible);
        } catch (e) {
          throw new Error(`Invalid CSS selector: ${sel}`);
        }
      }
    }

    /**
     * 按文本查找元素
     */
    function findByText(searchText, roleFilter) {
      const wanted = searchText.toLowerCase();
      const scored = [];

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      let n = walker.nextNode();
      while (n) {
        const el = n;
        if (!isElementVisible(el)) {
          n = walker.nextNode();
          continue;
        }
        if (roleFilter === 'button' && !isButtonLike(el)) {
          n = walker.nextNode();
          continue;
        }

        const htmlEl = el;
        const inner = ((htmlEl.innerText || el.textContent || '')).replace(/\s+/g, ' ').trim().toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
        const title = (el.getAttribute('title') || '').trim().toLowerCase();
        const placeholder = (el.getAttribute('placeholder') || '').trim().toLowerCase();
        const value = (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ? (el.value || '').trim().toLowerCase() : '';
        const name = (el.getAttribute('name') || '').trim().toLowerCase();
        const label = (getLabelText(el) || '').trim().toLowerCase();

        const hay = [inner, aria, title, placeholder, value, name, label].filter(Boolean).join(' | ');
        if (hay && hay.includes(wanted)) {
          let score = 0;
          const fields = [inner, aria, title, placeholder, label, name, value].filter(Boolean);
          for (const f of fields) {
            if (f === wanted) score = Math.max(score, 100);
            else if (f.startsWith(wanted)) score = Math.max(score, 80);
            else if (f.includes(wanted)) score = Math.max(score, 60);
          }
          if (roleFilter === 'button' && isButtonLike(el)) score += 10;
          if (el.disabled) score -= 30;
          const r = htmlEl.getBoundingClientRect?.();
          if (r) score += Math.max(0, 10 - Math.min(10, Math.floor(r.width / 200)));
          scored.push({ el, score });
        }
        n = walker.nextNode();
      }

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, 20).map(s => s.el);
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

      // 分配 ref (使用 @e1 格式，兼容 ref_1)
      const refNum = ++refCounter;
      const ref = `ref_${refNum}`;
      const refAlias = `@e${refNum}`;
      window.__claudeElementMap[ref] = new WeakRef(el);
      window.__claudeElementMap[refAlias] = new WeakRef(el);

      // 获取元素信息
      const type = getElementType(el);
      const name = getAccessibleName(el);
      const rect = el.getBoundingClientRect();

      // 构建输出行
      let line = `${indent}- ${type}`;
      if (name) line += ` "${name}"`;
      line += ` ${refAlias}`;
      
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

    // 如果指定了 selector 或 text，先查找匹配的元素
    let matchedElements = null;
    if (selector) {
      try {
        matchedElements = queryElements(selector, selectorType || 'css');
      } catch (error) {
        return {
          success: false,
          error: error.message,
        };
      }
    } else if (text) {
      matchedElements = findByText(text, role);
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

    // 如果有匹配的元素，只返回匹配的元素
    if (matchedElements && matchedElements.length > 0) {
      // 重新生成只包含匹配元素的树
      const filteredLines = [];
      const filteredRefs = [];
      refCounter = 0;
      window.__claudeElementMap = {};

      matchedElements.forEach((el, idx) => {
        if (!isElementVisible(el)) return;
        
        const refNum = ++refCounter;
        const ref = `ref_${refNum}`;
        const refAlias = `@e${refNum}`;
        window.__claudeElementMap[ref] = new WeakRef(el);
        window.__claudeElementMap[refAlias] = new WeakRef(el);

        const type = getElementType(el);
        const name = getAccessibleName(el);
        const rect = el.getBoundingClientRect();
        const interactive = isInteractive(el);

        let line = `- ${type}`;
        if (name) line += ` "${name}"`;
        line += ` ${refAlias}`;
        if (interactive) {
          line += ` (x=${Math.round(rect.left + rect.width/2)},y=${Math.round(rect.top + rect.height/2)})`;
        }
        filteredLines.push(line);
        filteredRefs.push(refAlias);
      });

      const endTime = performance.now();
      return {
        success: true,
        pageContent: filteredLines.join('\n'),
        viewport,
        stats: {
          processed: matchedElements.length,
          included: filteredLines.length,
          durationMs: Math.round(endTime - startTime),
        },
        refMap: filteredRefs,
      };
    }

    const endTime = performance.now();

    // 生成 refs 列表（包含 @e1 和 ref_1 两种格式）
    const refMap = Object.keys(window.__claudeElementMap).filter(ref => ref.startsWith('@e'));

    return {
      success: true,
      pageContent: lines.join('\n'),
      viewport,
      stats: {
        processed: processedCount,
        included: includedCount,
        durationMs: Math.round(endTime - startTime),
      },
      refMap: refMap,
    };
  }

  /**
   * 解析 ref 获取元素信息
   */
  function resolveRef(ref) {
    // 支持 @e1 和 ref_1 两种格式
    const normalizedRef = ref;
    const weak = window.__claudeElementMap[normalizedRef];
    let el = weak && typeof weak.deref === 'function' ? weak.deref() : null;
    
    if (!el) {
      // 尝试另一种格式
      const altRef = ref.startsWith('@') ? ref.replace('@e', 'ref_') : ref.replace('ref_', '@e');
      const altWeak = window.__claudeElementMap[altRef];
      el = altWeak && typeof altWeak.deref === 'function' ? altWeak.deref() : null;
      if (!el) {
        return { success: false, error: `ref "${ref}" not found` };
      }
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
    // 支持 @e1 和 ref_1 两种格式
    const normalizedRef = ref;
    const weak = window.__claudeElementMap[normalizedRef];
    let el = weak && typeof weak.deref === 'function' ? weak.deref() : null;
    
    if (!el) {
      // 尝试另一种格式
      const altRef = ref.startsWith('@') ? ref.replace('@e', 'ref_') : ref.replace('ref_', '@e');
      const altWeak = window.__claudeElementMap[altRef];
      el = altWeak && typeof altWeak.deref === 'function' ? altWeak.deref() : null;
    }
    
    if (!el) {
      return { success: false, error: `ref "${ref}" not found` };
    }

    el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
    if (typeof el.focus === 'function') {
      el.focus();
    }
    
    return { success: true };
  }

  // ============================================
  // Click Helper 功能
  // ============================================

  /**
   * 等待元素出现
   * @param {Object} options - 等待选项
   * @param {string} options.selector - CSS 选择器或 XPath
   * @param {string} options.selectorType - 'css' 或 'xpath'，默认 'css'
   * @param {number} options.timeout - 超时时间（毫秒），默认 5000
   * @param {boolean} options.visible - 是否等待元素可见，默认 true
   * @returns {Promise<Element>}
   */
  function waitForElement(options) {
    const { selector, selectorType = 'css', timeout = 5000, visible = true } = options;
    
    return new Promise((resolve, reject) => {
      // 检查元素是否可见
      function isElementVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }

      // 查找元素的辅助函数
      function findElement() {
        let element = null;
        if (selectorType === 'xpath') {
          try {
            const result = document.evaluate(
              selector,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null
            );
            element = result.singleNodeValue;
          } catch (e) {
            // XPath 错误，返回 null
          }
        } else {
          try {
            element = document.querySelector(selector);
          } catch (e) {
            // CSS 选择器错误，返回 null
          }
        }
        return element;
      }

      // 立即检查元素是否存在
      const element = findElement();
      
      // 如果元素已存在且（不需要可见性检查或已可见），直接返回
      if (element && (!visible || isElementVisible(element))) {
        resolve(element);
        return;
      }

      // 设置超时
      const timeoutId = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element not found or not visible within ${timeout}ms: ${selector}`));
      }, timeout);

      // 使用 MutationObserver 监听 DOM 变化
      const observer = new MutationObserver(() => {
        const foundElement = findElement();
        
        if (foundElement && (!visible || isElementVisible(foundElement))) {
          clearTimeout(timeoutId);
          observer.disconnect();
          resolve(foundElement);
        }
      });

      // 开始观察
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
    });
  }

  /**
   * 检查元素可见性
   */
  function isElementVisibleForClick(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight ||
        rect.right < 0 || rect.left > window.innerWidth) {
      return false;
    }
    return true;
  }

  /**
   * 规范化鼠标事件参数
   */
  function normalizeMouseOpts(x, y, options = {}) {
    const bubbles = options.bubbles !== false;
    const cancelable = options.cancelable !== false;
    const altKey = !!(options.modifiers && options.modifiers.altKey);
    const ctrlKey = !!(options.modifiers && options.modifiers.ctrlKey);
    const metaKey = !!(options.modifiers && options.modifiers.metaKey);
    const shiftKey = !!(options.modifiers && options.modifiers.shiftKey);
    const btn = String(options.button || 'left');
    const button = btn === 'right' ? 2 : btn === 'middle' ? 1 : 0;
    const buttons = btn === 'right' ? 2 : btn === 'middle' ? 4 : 1;
    return {
      bubbles, cancelable, altKey, ctrlKey, metaKey, shiftKey,
      button, buttons, clientX: x, clientY: y, view: window,
    };
  }

  /**
   * 派发点击事件序列
   */
  function dispatchClickSequence(element, x, y, options = {}, isDouble = false) {
    const base = normalizeMouseOpts(x, y, options);
    try { element.dispatchEvent(new MouseEvent('mousedown', base)); } catch {}
    try { element.dispatchEvent(new MouseEvent('mouseup', base)); } catch {}
    try { element.dispatchEvent(new MouseEvent('click', base)); } catch {}
    
    if (base.button === 2) {
      try { element.dispatchEvent(new MouseEvent('contextmenu', base)); } catch {}
    }
    
    if (isDouble) {
      setTimeout(() => {
        try { element.dispatchEvent(new MouseEvent('mousedown', base)); } catch {}
        try { element.dispatchEvent(new MouseEvent('mouseup', base)); } catch {}
        try { element.dispatchEvent(new MouseEvent('click', base)); } catch {}
        try { element.dispatchEvent(new MouseEvent('dblclick', base)); } catch {}
      }, 30);
    }
  }

  /**
   * 点击元素
   */
  async function clickElement(params) {
    const { selector, waitForNavigation, timeout, coordinates, ref, double, options, waitFor } = params;
    
    try {
      // 如果提供了 waitFor，先等待元素出现
      if (waitFor && waitFor.selector) {
        try {
          await waitForElement({
            selector: waitFor.selector,
            selectorType: waitFor.selectorType || 'css',
            timeout: waitFor.timeout || 5000,
            visible: waitFor.visible !== false,
          });
        } catch (error) {
          return { error: `WaitFor failed: ${error.message}` };
        }
      }

      let element = null;
      let elementInfo = null;
      let clickX, clickY;

      // 1. 通过 ref 查找元素
      if (ref && typeof ref === 'string') {
        let target = null;
        try {
          const map = window.__claudeElementMap;
          const weak = map && map[ref];
          target = weak && typeof weak.deref === 'function' ? weak.deref() : null;
          if (!target) {
            // 尝试另一种格式
            const altRef = ref.startsWith('@') ? ref.replace('@e', 'ref_') : ref.replace('ref_', '@e');
            const altWeak = map && map[altRef];
            target = altWeak && typeof altWeak.deref === 'function' ? altWeak.deref() : null;
          }
        } catch (e) {
          // ignore
        }

        if (!target || !(target instanceof Element)) {
          return {
            error: `Element ref "${ref}" not found. Please call readPage first.`,
          };
        }

        element = target;
        element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
        await new Promise((resolve) => setTimeout(resolve, 80));

        const rect = element.getBoundingClientRect();
        clickX = rect.left + rect.width / 2;
        clickY = rect.top + rect.height / 2;
        elementInfo = {
          tagName: element.tagName,
          id: element.id,
          className: element.className,
          text: element.textContent?.trim().substring(0, 100) || '',
          clickMethod: 'ref',
          ref,
        };
      }
      // 2. 通过坐标点击
      else if (coordinates && typeof coordinates.x === 'number' && typeof coordinates.y === 'number') {
        clickX = coordinates.x;
        clickY = coordinates.y;
        element = document.elementFromPoint(clickX, clickY);

        if (element) {
          elementInfo = {
            tagName: element.tagName,
            id: element.id,
            text: element.textContent?.trim().substring(0, 100) || '',
            clickMethod: 'coordinates',
            clickPosition: { x: clickX, y: clickY },
          };
        } else {
          elementInfo = {
            clickMethod: 'coordinates',
            clickPosition: { x: clickX, y: clickY },
            warning: 'No element found at coordinates',
          };
        }
      }
      // 3. 通过选择器点击
      else if (selector) {
        // 如果已经通过 waitFor 等待过相同的选择器，直接查找
        if (waitFor && waitFor.selector === selector) {
          element = document.querySelector(selector);
        } else {
          // 尝试等待元素出现（使用默认超时）
          try {
            element = await waitForElement({
              selector,
              selectorType: params.selectorType || 'css',
              timeout: timeout || 5000,
              visible: true,
            });
          } catch (error) {
            // 如果等待失败，尝试直接查找
            element = document.querySelector(selector);
          }
        }
        
        if (!element) {
          return { error: `Element with selector "${selector}" not found` };
        }

        element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
        await new Promise((resolve) => setTimeout(resolve, 100));

        if (!isElementVisibleForClick(element)) {
          return { error: `Element with selector "${selector}" is not visible` };
        }

        const rect = element.getBoundingClientRect();
        clickX = rect.left + rect.width / 2;
        clickY = rect.top + rect.height / 2;
        elementInfo = {
          tagName: element.tagName,
          id: element.id,
          text: element.textContent?.trim().substring(0, 100) || '',
          clickMethod: 'selector',
        };
      } else {
        return { error: 'Must provide ref, selector, or coordinates' };
      }

      // 设置导航监听
      let navigationPromise;
      if (waitForNavigation) {
        navigationPromise = new Promise((resolve) => {
          const listener = () => {
            window.removeEventListener('beforeunload', listener);
            resolve(true);
          };
          window.addEventListener('beforeunload', listener);
          setTimeout(() => {
            window.removeEventListener('beforeunload', listener);
            resolve(false);
          }, timeout || 5000);
        });
      }

      // 执行点击
      if (element) {
        dispatchClickSequence(element, clickX, clickY, options || {}, double || false);
      } else {
        const el = document.elementFromPoint(clickX, clickY);
        if (el) {
          dispatchClickSequence(el, clickX, clickY, options || {}, double || false);
        }
      }

      let navigationOccurred = false;
      if (waitForNavigation) {
        navigationOccurred = await navigationPromise;
      }

      return {
        success: true,
        message: 'Element clicked successfully',
        elementInfo,
        navigationOccurred,
      };
    } catch (error) {
      return { error: `Error clicking element: ${error.message}` };
    }
  }

  /**
   * 悬停操作
   */
  async function hoverElement(params) {
    const { ref, selector, duration } = params;
    
    try {
      let element = null;

      if (ref && typeof ref === 'string') {
        const map = window.__claudeElementMap;
        const weak = map && map[ref];
        element = weak && typeof weak.deref === 'function' ? weak.deref() : null;
        if (!element) {
          const altRef = ref.startsWith('@') ? ref.replace('@e', 'ref_') : ref.replace('ref_', '@e');
          const altWeak = map && map[altRef];
          element = altWeak && typeof altWeak.deref === 'function' ? altWeak.deref() : null;
        }
        if (!element || !(element instanceof Element)) {
          return { error: `Element ref "${ref}" not found` };
        }
      } else if (selector) {
        element = document.querySelector(selector);
        if (!element) {
          return { error: `Element with selector "${selector}" not found` };
        }
      } else {
        return { error: 'Must provide ref or selector' };
      }

      // 滚动到可见
      element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 触发悬停事件序列
      const rect = element.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height / 2;
      
      element.dispatchEvent(new MouseEvent('mouseenter', { 
        bubbles: true, 
        cancelable: true,
        clientX,
        clientY,
        view: window
      }));
      element.dispatchEvent(new MouseEvent('mouseover', { 
        bubbles: true, 
        cancelable: true,
        clientX,
        clientY,
        view: window
      }));
      element.dispatchEvent(new MouseEvent('mousemove', { 
        bubbles: true, 
        cancelable: true,
        clientX,
        clientY,
        view: window
      }));
      
      // 等待悬停效果出现
      await new Promise(r => setTimeout(r, duration || 300));

      return {
        success: true,
        message: 'Element hovered successfully',
      };
    } catch (error) {
      return { error: `Error hovering element: ${error.message}` };
    }
  }

  /**
   * 滚动操作
   */
  async function scrollElement(params) {
    const { ref, selector, amount } = params;
    
    try {
      if (typeof amount === 'number') {
        // 滚动页面
        window.scrollBy({ top: amount, left: 0, behavior: 'instant' });
        return {
          success: true,
          message: 'Page scrolled successfully',
        };
      }

      let element = null;
      if (ref && typeof ref === 'string') {
        const map = window.__claudeElementMap;
        const weak = map && map[ref];
        element = weak && typeof weak.deref === 'function' ? weak.deref() : null;
        if (!element) {
          const altRef = ref.startsWith('@') ? ref.replace('@e', 'ref_') : ref.replace('ref_', '@e');
          const altWeak = map && map[altRef];
          element = altWeak && typeof altWeak.deref === 'function' ? altWeak.deref() : null;
        }
        if (!element || !(element instanceof Element)) {
          return { error: `Element ref "${ref}" not found` };
        }
      } else if (selector) {
        element = document.querySelector(selector);
        if (!element) {
          return { error: `Element with selector "${selector}" not found` };
        }
      } else {
        return { error: 'Must provide amount, ref, or selector' };
      }

      element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      
      return {
        success: true,
        message: 'Element scrolled into view',
      };
    } catch (error) {
      return { error: `Error scrolling: ${error.message}` };
    }
  }

  /**
   * 键盘按键
   */
  async function pressKey(params) {
    const { ref, selector, key, modifiers } = params;
    
    try {
      let element = document.activeElement || document.body;
      
      if (ref && typeof ref === 'string') {
        const map = window.__claudeElementMap;
        const weak = map && map[ref];
        const el = weak && typeof weak.deref === 'function' ? weak.deref() : null;
        if (el) {
          element = el;
        } else {
          const altRef = ref.startsWith('@') ? ref.replace('@e', 'ref_') : ref.replace('ref_', '@e');
          const altWeak = map && map[altRef];
          const altEl = altWeak && typeof altWeak.deref === 'function' ? altWeak.deref() : null;
          if (altEl) {
            element = altEl;
          }
        }
      } else if (selector) {
        const el = document.querySelector(selector);
        if (el) {
          element = el;
        }
      }

      // 聚焦元素
      if (typeof element.focus === 'function') {
        element.focus();
      }

      // 映射按键名称
      const keyCodeMap = {
        'Enter': 'Enter',
        'Escape': 'Escape',
        'Tab': 'Tab',
        'ArrowDown': 'ArrowDown',
        'ArrowUp': 'ArrowUp',
        'ArrowLeft': 'ArrowLeft',
        'ArrowRight': 'ArrowRight',
        'Backspace': 'Backspace',
        'Delete': 'Delete',
        'Space': 'Space',
      };
      
      const code = keyCodeMap[key] || key;
      const keyValue = key === 'Space' ? ' ' : key;
      
      const eventInit = {
        key: keyValue,
        code,
        bubbles: true,
        cancelable: true,
        ctrlKey: !!(modifiers && modifiers.ctrl),
        shiftKey: !!(modifiers && modifiers.shift),
        altKey: !!(modifiers && modifiers.alt),
        metaKey: !!(modifiers && modifiers.meta),
      };
      
      element.dispatchEvent(new KeyboardEvent('keydown', eventInit));
      element.dispatchEvent(new KeyboardEvent('keypress', eventInit));
      element.dispatchEvent(new KeyboardEvent('keyup', eventInit));
      
      return {
        success: true,
        message: `Key "${key}" pressed successfully`,
      };
    } catch (error) {
      return { error: `Error pressing key: ${error.message}` };
    }
  }

  // ============================================
  // Fill Helper 功能
  // ============================================

  /**
   * 填充元素
   */
  async function fillElement(params) {
    const { selector, value, ref, text, index, clear, waitFor } = params;
    
    try {
      // 如果提供了 waitFor，先等待元素出现
      if (waitFor && waitFor.selector) {
        try {
          await waitForElement({
            selector: waitFor.selector,
            selectorType: waitFor.selectorType || 'css',
            timeout: waitFor.timeout || 5000,
            visible: waitFor.visible !== false,
          });
        } catch (error) {
          return { error: `WaitFor failed: ${error.message}` };
        }
      }

      // 1. 查找元素
      let element = null;
      if (ref && typeof ref === 'string') {
        try {
          const map = window.__claudeElementMap;
          const weak = map && map[ref];
          element = weak && typeof weak.deref === 'function' ? weak.deref() : null;
          if (!element) {
            const altRef = ref.startsWith('@') ? ref.replace('@e', 'ref_') : ref.replace('ref_', '@e');
            const altWeak = map && map[altRef];
            element = altWeak && typeof altWeak.deref === 'function' ? altWeak.deref() : null;
          }
        } catch (e) {
          // ignore
        }
        if (!element || !(element instanceof Element)) {
          return { error: `Element ref "${ref}" not found. Please call readPage first.` };
        }
      } else if (selector) {
        // 如果已经通过 waitFor 等待过相同的选择器，直接查找
        if (waitFor && waitFor.selector === selector) {
          element = document.querySelector(selector);
        } else {
          // 尝试等待元素出现（使用默认超时）
          try {
            element = await waitForElement({
              selector,
              selectorType: params.selectorType || 'css',
              timeout: 5000,
              visible: true,
            });
          } catch (error) {
            // 如果等待失败，尝试直接查找
            element = document.querySelector(selector);
          }
        }
      }

      if (!element) {
        return { error: selector ? `Element "${selector}" not found` : 'Element not found' };
      }

      // 2. 获取元素信息
      const rect = element.getBoundingClientRect();
      const elementInfo = {
        tagName: element.tagName,
        id: element.id,
        type: element.type || null,
        isVisible: isElementVisibleForClick(element),
      };

      if (!elementInfo.isVisible) {
        return { error: `Element is not visible`, elementInfo };
      }

      // 3. 验证可填充类型
      const validTags = ['INPUT', 'TEXTAREA', 'SELECT'];
      if (!validTags.includes(element.tagName)) {
        return { error: 'Element is not fillable (must be INPUT, TEXTAREA, or SELECT)', elementInfo };
      }

      // 4. 滚动到视口并聚焦
      element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      await new Promise((resolve) => setTimeout(resolve, 100));
      element.focus();

      // 5. 根据类型处理
      
      // Checkbox
      if (element.tagName === 'INPUT' && element.type === 'checkbox') {
        let checkedVal;
        if (typeof value === 'boolean') {
          checkedVal = value;
        } else if (typeof value === 'string') {
          const v = value.trim().toLowerCase();
          if (['true', '1', 'yes', 'on'].includes(v)) checkedVal = true;
          else if (['false', '0', 'no', 'off'].includes(v)) checkedVal = false;
        }
        if (typeof checkedVal !== 'boolean') {
          return { error: 'Checkbox requires boolean value', elementInfo };
        }
        element.checked = checkedVal;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.blur();
        return { success: true, message: `Checkbox set to ${element.checked}`, elementInfo };
      }

      // Radio
      if (element.tagName === 'INPUT' && element.type === 'radio') {
        element.checked = true;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.blur();
        return { success: true, message: 'Radio selected', elementInfo };
      }

      // Range
      if (element.tagName === 'INPUT' && element.type === 'range') {
        const numericValue = typeof value === 'number' ? value : Number(value);
        if (Number.isNaN(numericValue)) {
          return { error: 'Range input requires numeric value', elementInfo };
        }
        element.value = String(numericValue);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.blur();
        return { success: true, message: `Range set to ${element.value}`, elementInfo };
      }

      // Number
      if (element.tagName === 'INPUT' && element.type === 'number') {
        if (value !== '' && value !== null && Number.isNaN(Number(value))) {
          return { error: 'Number input requires numeric value', elementInfo };
        }
        element.value = String(value ?? '');
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.blur();
        return { success: true, message: `Number set to ${element.value}`, elementInfo };
      }

      // Select
      if (element.tagName === 'SELECT') {
        let optionFound = false;
        const options = Array.from(element.options);
        
        if (index !== undefined && typeof index === 'number') {
          if (options[index]) {
            element.value = options[index].value;
            optionFound = true;
          }
        } else if (text) {
          const wanted = String(text).toLowerCase();
          const option = options.find(o => o.text.toLowerCase().includes(wanted));
          if (option) {
            element.value = option.value;
            optionFound = true;
          }
        } else if (value !== undefined) {
          const option = options.find(o => o.value === value || o.text === value);
          if (option) {
            element.value = option.value;
            optionFound = true;
          }
        }
        
        if (!optionFound) {
          return { error: `No matching option found`, elementInfo };
        }
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.blur();
        return { success: true, message: 'Option selected', elementInfo };
      }

      // Text input / Textarea
      if (clear !== false) {
        element.value = '';
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
      element.value = String(value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.blur();

      return {
        success: true,
        message: 'Element filled successfully',
        elementInfo: { ...elementInfo, value: element.value },
      };
    } catch (error) {
      return { error: `Error filling element: ${error.message}` };
    }
  }

  // ============================================
  // 统一消息接口
  // ============================================

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    // readPage action
    if (request.action === 'readPage') {
      const result = generateAccessibilityTree({
        filter: request.filter,
        depth: request.depth,
        refId: request.refId,
        selector: request.selector,
        selectorType: request.selectorType,
        text: request.text,
        role: request.role,
      });
      sendResponse(result);
      return false;
    }

    // interact action
    if (request.action === 'interact') {
      const { interactAction } = request;
      
      if (interactAction === 'click') {
        clickElement({
          selector: request.selector,
          selectorType: request.selectorType,
          waitForNavigation: request.waitForNavigation,
          timeout: request.timeout,
          coordinates: request.coordinates,
          ref: request.ref,
          double: request.double,
          waitFor: request.waitFor,
          options: {
            button: request.button,
            bubbles: request.bubbles,
            cancelable: request.cancelable,
            modifiers: request.modifiers,
          },
        })
          .then(sendResponse)
          .catch((error) => sendResponse({ error: error.message }));
        return true;
      }
      
      if (interactAction === 'hover') {
        hoverElement({
          ref: request.ref,
          selector: request.selector,
          duration: request.duration,
        })
          .then(sendResponse)
          .catch((error) => sendResponse({ error: error.message }));
        return true;
      }
      
      if (interactAction === 'scroll') {
        scrollElement({
          ref: request.ref,
          selector: request.selector,
          amount: request.amount,
        })
          .then(sendResponse)
          .catch((error) => sendResponse({ error: error.message }));
        return true;
      }
      
      if (interactAction === 'key') {
        pressKey({
          ref: request.ref,
          selector: request.selector,
          key: request.key,
          modifiers: request.modifiers,
        })
          .then(sendResponse)
          .catch((error) => sendResponse({ error: error.message }));
        return true;
      }
      
      sendResponse({ error: `Unknown interactAction: ${interactAction}` });
      return false;
    }

    // fill action
    if (request.action === 'fill') {
      fillElement({
        selector: request.selector,
        selectorType: request.selectorType,
        value: request.value,
        ref: request.ref,
        text: request.text,
        index: request.index,
        clear: request.clear,
        waitFor: request.waitFor,
      })
        .then(sendResponse)
        .catch((error) => sendResponse({ error: error.message }));
      return true;
    }

    // 兼容旧的消息格式
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

    // Ping 消息
    if (request.action === 'chrome_read_page_ping' || 
        request.action === 'chrome_unified_helper_ping') {
      sendResponse({ status: 'pong' });
      return false;
    }
  });
}
