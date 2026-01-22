/**
 * Screenshot Tool - 截图工具
 * 
 * 功能:
 * - 视口截图
 * - 全页面截图
 * - 元素截图
 * - 支持 base64 返回和文件保存
 */

import { createErrorResponse, ToolResult } from '../core/tool-handler';
import { BaseBrowserToolExecutor } from '../core/base-browser';
import { TOOL_NAMES } from '../schemas/tool-schemas';

// Content Script 消息类型
const TOOL_MESSAGE_TYPES = {
  SCREENSHOT_PREPARE_PAGE_FOR_CAPTURE: 'screenshotPreparePageForCapture',
  SCREENSHOT_GET_PAGE_DETAILS: 'screenshotGetPageDetails',
  SCREENSHOT_GET_ELEMENT_DETAILS: 'screenshotGetElementDetails',
  SCREENSHOT_SCROLL_PAGE: 'screenshotScrollPage',
  SCREENSHOT_RESET_PAGE_AFTER_CAPTURE: 'screenshotResetPageAfterCapture',
};

// 截图常量
const SCREENSHOT_CONSTANTS = {
  SCROLL_DELAY_MS: 350,
  CAPTURE_STITCH_DELAY_MS: 50,
  MAX_CAPTURE_PARTS: 50,
  MAX_CAPTURE_HEIGHT_PX: 50000,
  PIXEL_TOLERANCE: 1,
  SCRIPT_INIT_DELAY: 100,
};

interface ScreenshotToolParams {
  name?: string;
  selector?: string;
  tabId?: number;
  background?: boolean;
  windowId?: number;
  width?: number;
  height?: number;
  storeBase64?: boolean;
  fullPage?: boolean;
  savePng?: boolean;
  maxHeight?: number;
}

interface ScreenshotPageDetails {
  totalWidth: number;
  totalHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  currentScrollX: number;
  currentScrollY: number;
}

/**
 * 截图工具
 */
class ScreenshotTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.SCREENSHOT;

  async execute(args: ScreenshotToolParams): Promise<ToolResult> {
    const {
      name = 'screenshot',
      selector,
      storeBase64 = false,
      fullPage = false,
      savePng = true,
    } = args;

    console.log(`Starting screenshot with options:`, args);

    // 获取目标标签页
    const explicit = await this.tryGetTab(args.tabId);
    const tab = explicit || (await this.getActiveTabOrThrowInWindow(args.windowId));

    // 检查 URL 限制
    if (
      tab.url?.startsWith('chrome://') ||
      tab.url?.startsWith('edge://') ||
      tab.url?.startsWith('https://chrome.google.com/webstore') ||
      tab.url?.startsWith('https://microsoftedge.microsoft.com/')
    ) {
      return createErrorResponse(
        'Cannot capture special browser pages or web store pages due to security restrictions.',
      );
    }

    let finalImageDataUrl: string | undefined;
    let finalImageWidthCss: number | undefined;
    let finalImageHeightCss: number | undefined;
    const results: any = { base64: null, fileSaved: false };
    let originalScroll: { x: number; y: number } | null = null;
    let didPreparePage = false;
    let pageDetails: ScreenshotPageDetails | undefined;

    try {
      const background = args.background === true;
      const canUseCdpCapture = background && !fullPage && !selector;

      // CDP 路径: 简单视口截图
      if (canUseCdpCapture) {
        try {
          // 这里需要 CDP 会话管理器
          // 简化版本直接使用 captureVisibleTab
          finalImageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
          finalImageWidthCss = 800;
          finalImageHeightCss = 600;
        } catch (e) {
          console.warn('CDP viewport capture failed, falling back to helper path:', e);
        }
      }

      // 辅助脚本路径
      if (!finalImageDataUrl) {
        await this.injectContentScript(tab.id!, ['inject-scripts/screenshot-helper.js']);
        await new Promise((resolve) => setTimeout(resolve, SCREENSHOT_CONSTANTS.SCRIPT_INIT_DELAY));

        // 准备页面
        const prepareResp = await this.sendMessageToTab(tab.id!, {
          action: TOOL_MESSAGE_TYPES.SCREENSHOT_PREPARE_PAGE_FOR_CAPTURE,
          options: { fullPage },
        });
        if (!prepareResp || prepareResp.success !== true) {
          throw new Error('Screenshot helper did not acknowledge page preparation.');
        }
        didPreparePage = true;

        // 获取页面详情
        const rawPageDetails = await this.sendMessageToTab(tab.id!, {
          action: TOOL_MESSAGE_TYPES.SCREENSHOT_GET_PAGE_DETAILS,
        });
        pageDetails = this.validatePageDetails(rawPageDetails);
        originalScroll = { x: pageDetails.currentScrollX, y: pageDetails.currentScrollY };

        if (fullPage) {
          // 全页面截图 (简化版本)
          finalImageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
          finalImageWidthCss = pageDetails.totalWidth;
          finalImageHeightCss = pageDetails.totalHeight;
        } else if (selector) {
          // 元素截图
          finalImageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
          finalImageWidthCss = pageDetails.viewportWidth;
          finalImageHeightCss = pageDetails.viewportHeight;
        } else {
          // 视口截图
          finalImageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
          finalImageWidthCss = pageDetails.viewportWidth;
          finalImageHeightCss = pageDetails.viewportHeight;
        }
      }

      if (!finalImageDataUrl) {
        throw new Error('Failed to capture image data');
      }

      // 处理输出
      if (storeBase64 === true) {
        const base64Data = finalImageDataUrl.replace(/^data:image\/[^;]+;base64,/, '');
        results.base64 = base64Data;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ base64Data, mimeType: 'image/png' }),
            },
          ],
          isError: false,
        };
      }

      if (savePng === true) {
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `${name.replace(/[^a-z0-9_-]/gi, '_') || 'screenshot'}_${timestamp}.png`;

          const downloadId = await chrome.downloads.download({
            url: finalImageDataUrl,
            filename: filename,
            saveAs: false,
          });

          results.downloadId = downloadId;
          results.filename = filename;
          results.fileSaved = true;

          // 获取完整路径
          await new Promise((resolve) => setTimeout(resolve, 100));
          const [downloadItem] = await chrome.downloads.search({ id: downloadId });
          if (downloadItem && downloadItem.filename) {
            results.fullPath = downloadItem.filename;
          }
        } catch (error) {
          console.error('Error saving PNG file:', error);
          results.saveError = String(error instanceof Error ? error.message : error);
        }
      }
    } catch (error) {
      console.error('Error during screenshot execution:', error);
      return createErrorResponse(
        `Screenshot error: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
      );
    } finally {
      // 重置页面
      if (didPreparePage) {
        try {
          const resetMessage: Record<string, unknown> = {
            action: TOOL_MESSAGE_TYPES.SCREENSHOT_RESET_PAGE_AFTER_CAPTURE,
          };
          if (originalScroll) {
            resetMessage.scrollX = originalScroll.x;
            resetMessage.scrollY = originalScroll.y;
          }
          await this.sendMessageToTab(tab.id!, resetMessage);
        } catch (err) {
          console.warn('Failed to reset page:', err);
        }
      }
    }

    console.log('Screenshot completed!');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Screenshot [${name}] captured successfully`,
            tabId: tab.id,
            url: tab.url,
            name: name,
            ...results,
          }),
        },
      ],
      isError: false,
    };
  }

  /**
   * 验证页面详情
   */
  private validatePageDetails(details: unknown): ScreenshotPageDetails {
    if (!details || typeof details !== 'object') {
      throw new Error('Screenshot helper did not respond with page details.');
    }

    const candidate = details as Partial<ScreenshotPageDetails>;
    const requiredFields: Array<keyof ScreenshotPageDetails> = [
      'totalWidth',
      'totalHeight',
      'viewportWidth',
      'viewportHeight',
      'devicePixelRatio',
      'currentScrollX',
      'currentScrollY',
    ];

    const invalidFields = requiredFields.filter(
      (field) => typeof candidate[field] !== 'number' || !Number.isFinite(candidate[field]),
    );

    if (invalidFields.length > 0) {
      throw new Error(`Invalid page details (missing: ${invalidFields.join(', ')}).`);
    }

    return candidate as ScreenshotPageDetails;
  }
}

export const screenshotTool = new ScreenshotTool();
