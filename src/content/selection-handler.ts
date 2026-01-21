/**
 * 文本选择处理器
 */

import { getSelectedText } from '@/shared/utils/dom-utils';

/**
 * 选择处理器配置
 */
interface SelectionHandlerOptions {
  minLength?: number;
  showFloatingButton?: boolean;
  onSelection?: (text: string) => void;
}

/**
 * 选择处理器类
 */
export class SelectionHandler {
  private options: Required<SelectionHandlerOptions>;
  private cleanupFunctions: (() => void)[] = [];

  constructor(options: SelectionHandlerOptions = {}) {
    this.options = {
      minLength: options.minLength || 10,
      showFloatingButton: options.showFloatingButton ?? false,
      onSelection: options.onSelection || (() => {}),
    };
  }

  /**
   * 初始化
   */
  init() {
    this.setupListeners();
  }

  /**
   * 设置事件监听
   */
  private setupListeners() {
    const handleSelection = () => {
      const text = getSelectedText();
      
      if (text && text.length >= this.options.minLength) {
        this.options.onSelection(text);
        
        if (this.options.showFloatingButton) {
          this.showFloatingButton();
        }
      } else {
        this.hideFloatingButton();
      }
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('keyup', handleSelection);

    this.cleanupFunctions.push(() => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('keyup', handleSelection);
    });
  }

  /**
   * 显示悬浮按钮
   */
  private showFloatingButton() {
    // TODO: 实现悬浮按钮显示逻辑
    // 这里可以创建一个小的工具栏，提供快速操作入口
  }

  /**
   * 隐藏悬浮按钮
   */
  private hideFloatingButton() {
    // TODO: 实现悬浮按钮隐藏逻辑
  }

  /**
   * 销毁
   */
  destroy() {
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];
  }
}
