/**
 * Click Helper - 点击辅助脚本
 * 
 * 注入到页面中处理点击操作
 * 支持:
 * - 通过选择器点击
 * - 通过坐标点击
 * - 通过元素 ref 点击
 * - 单击/双击
 * - 修饰键支持
 */

if (window.__CLICK_HELPER_INITIALIZED__) {
  // 已初始化，跳过
} else {
  window.__CLICK_HELPER_INITIALIZED__ = true;

  /**
   * 点击元素
   * @param {string} selector - CSS 选择器
   * @param {boolean} waitForNavigation - 是否等待导航完成
   * @param {number} timeout - 超时毫秒
   * @param {Object} coordinates - 坐标 {x, y}
   * @param {string} ref - 元素 ref
   * @param {boolean} double - 是否双击
   * @param {Object} options - 点击选项
   */
  async function clickElement(
    selector,
    waitForNavigation = false,
    timeout = 5000,
    coordinates = null,
    ref = null,
    double = false,
    options = {},
  ) {
    try {
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
        } catch (e) {
          // ignore
        }

        if (!target || !(target instanceof Element)) {
          return {
            error: `Element ref "${ref}" not found. Please call chrome_read_page first.`,
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
      else {
        element = document.querySelector(selector);
        if (!element) {
          return { error: `Element with selector "${selector}" not found` };
        }

        element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
        await new Promise((resolve) => setTimeout(resolve, 100));

        if (!isElementVisible(element)) {
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
          }, timeout);
        });
      }

      // 执行点击
      if (element) {
        dispatchClickSequence(element, clickX, clickY, options, double);
      } else {
        simulateClick(clickX, clickY, options, double);
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
   * 模拟点击
   */
  function simulateClick(x, y, options = {}, isDouble = false) {
    const element = document.elementFromPoint(x, y);
    if (!element) return;
    dispatchClickSequence(element, x, y, options, isDouble);
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
   * 检查元素可见性
   */
  function isElementVisible(element) {
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

  // 监听来自扩展的消息
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'clickElement') {
      clickElement(
        request.selector,
        request.waitForNavigation,
        request.timeout,
        request.coordinates,
        request.ref,
        !!request.double,
        {
          button: request.button,
          bubbles: request.bubbles,
          cancelable: request.cancelable,
          modifiers: request.modifiers,
        },
      )
        .then(sendResponse)
        .catch((error) => sendResponse({ error: error.message }));
      return true;
    } else if (request.action === 'chrome_click_element_ping') {
      sendResponse({ status: 'pong' });
      return false;
    }
  });
}
