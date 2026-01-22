/**
 * Keyboard Tool - 键盘输入模拟
 * 
 * 功能:
 * - 模拟按键 (Enter, Tab, Escape 等)
 * - 模拟组合键 (Ctrl+C, Ctrl+V, Cmd+A 等)
 * - 输入文本
 */

import { createErrorResponse, ToolResult } from '../core/tool-handler';
import { BaseBrowserToolExecutor } from '../core/base-browser';
import { TOOL_NAMES } from '../schemas/tool-schemas';
import { TIMEOUTS, ERROR_MESSAGES } from '../core/constants';

// Content Script 消息类型
const TOOL_MESSAGE_TYPES = {
  SIMULATE_KEYBOARD: 'simulateKeyboard',
  ENSURE_REF_FOR_SELECTOR: 'ensureRefForSelector',
  RESOLVE_REF: 'resolveRef',
};

interface KeyboardToolParams {
  keys: string;                    // 按键或组合键
  selector?: string;               // 目标元素选择器
  selectorType?: 'css' | 'xpath';  // 选择器类型
  delay?: number;                  // 按键间延迟
  tabId?: number;                  // 目标标签页
  windowId?: number;               // 窗口 ID
  frameId?: number;                // iframe frame ID
}

/**
 * 键盘输入工具
 */
class KeyboardTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.KEYBOARD;

  async execute(args: KeyboardToolParams): Promise<ToolResult> {
    const { keys, selector, selectorType = 'css', delay = TIMEOUTS.KEYBOARD_DELAY } = args;

    console.log(`Starting keyboard operation with options:`, args);

    if (!keys) {
      return createErrorResponse(
        ERROR_MESSAGES.INVALID_PARAMETERS + ': Keys parameter must be provided',
      );
    }

    try {
      const explicit = await this.tryGetTab(args.tabId);
      const tab = explicit || (await this.getActiveTabOrThrowInWindow(args.windowId));
      if (!tab.id) {
        return createErrorResponse(ERROR_MESSAGES.TAB_NOT_FOUND + ': Active tab has no ID');
      }

      let finalSelector = selector;
      let refForFocus: string | undefined = undefined;

      // 加载辅助脚本
      await this.injectContentScript(tab.id, ['inject-scripts/accessibility-tree-helper.js']);

      // XPath 转换
      if (selector && selectorType === 'xpath') {
        try {
          const ensured = await this.sendMessageToTab(tab.id, {
            action: TOOL_MESSAGE_TYPES.ENSURE_REF_FOR_SELECTOR,
            selector,
            isXPath: true,
          });
          if (!ensured || !ensured.success || !ensured.ref) {
            return createErrorResponse(
              `Failed to resolve XPath selector: ${ensured?.error || 'unknown error'}`,
            );
          }
          refForFocus = ensured.ref;
          
          // 尝试解析为 CSS 选择器
          const resolved = await this.sendMessageToTab(tab.id, {
            action: TOOL_MESSAGE_TYPES.RESOLVE_REF,
            ref: ensured.ref,
          });
          if (resolved && resolved.success && resolved.selector) {
            finalSelector = resolved.selector;
            refForFocus = undefined;
          }
        } catch (error) {
          return createErrorResponse(
            `Error resolving XPath: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // 通过 ref 聚焦元素
      if (refForFocus) {
        const focusResult = await this.sendMessageToTab(tab.id, {
          action: 'focusByRef',
          ref: refForFocus,
        });
        if (focusResult && !focusResult.success) {
          return createErrorResponse(
            `Failed to focus element by ref: ${focusResult.error || 'unknown error'}`,
          );
        }
        finalSelector = undefined;
      }

      // 注入键盘辅助脚本
      const frameIds = typeof args.frameId === 'number' ? [args.frameId] : undefined;
      await this.injectContentScript(
        tab.id,
        ['inject-scripts/keyboard-helper.js'],
        false,
        'ISOLATED',
        false,
        frameIds,
      );

      // 发送键盘模拟消息
      const result = await this.sendMessageToTab(
        tab.id,
        {
          action: TOOL_MESSAGE_TYPES.SIMULATE_KEYBOARD,
          keys,
          selector: finalSelector,
          delay,
        },
        args.frameId,
      );

      if (result.error) {
        return createErrorResponse(result.error);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: result.message || 'Keyboard operation successful',
              targetElement: result.targetElement,
              results: result.results,
            }),
          },
        ],
        isError: false,
      };
    } catch (error) {
      console.error('Error in keyboard operation:', error);
      return createErrorResponse(
        `Error simulating keyboard events: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const keyboardTool = new KeyboardTool();
