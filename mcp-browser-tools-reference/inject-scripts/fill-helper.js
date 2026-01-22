/**
 * Fill Helper - 表单填充辅助脚本
 * 
 * 注入到页面中处理表单填充操作
 * 支持:
 * - input/textarea 文本输入
 * - select 下拉选择
 * - checkbox 复选框
 * - radio 单选按钮
 * - range 滑块
 */

if (window.__FILL_HELPER_INITIALIZED__) {
  // 已初始化，跳过
} else {
  window.__FILL_HELPER_INITIALIZED__ = true;

  /**
   * 填充元素
   * @param {string} selector - CSS 选择器
   * @param {string|number|boolean} value - 要填充的值
   * @param {string} ref - 元素 ref
   */
  async function fillElement(selector, value, ref = null) {
    try {
      // 1. 查找元素
      let element = null;
      if (ref && typeof ref === 'string') {
        try {
          const map = window.__claudeElementMap;
          const weak = map && map[ref];
          element = weak && typeof weak.deref === 'function' ? weak.deref() : null;
        } catch (e) {
          // ignore
        }
        if (!element || !(element instanceof Element)) {
          return { error: `Element ref "${ref}" not found. Please call chrome_read_page first.` };
        }
      } else {
        element = document.querySelector(selector);
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
        isVisible: isElementVisible(element),
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
        for (const option of element.options) {
          if (option.value === value || option.text === value) {
            element.value = option.value;
            optionFound = true;
            break;
          }
        }
        if (!optionFound) {
          return { error: `No option with value "${value}" found`, elementInfo };
        }
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.blur();
        return { success: true, message: 'Option selected', elementInfo };
      }

      // Text input / Textarea
      element.value = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
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
    if (request.action === 'fillElement') {
      fillElement(request.selector, request.value, request.ref)
        .then(sendResponse)
        .catch((error) => sendResponse({ error: error.message }));
      return true;
    } else if (request.action === 'chrome_fill_or_select_ping') {
      sendResponse({ status: 'pong' });
      return false;
    }
  });
}
