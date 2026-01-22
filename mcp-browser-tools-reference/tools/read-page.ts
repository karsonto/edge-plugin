/**
 * Read Page Tool - 页面可访问性树读取
 * 
 * 功能:
 * - 获取页面的可访问性树结构
 * - 返回带 ref_* 标识符的元素列表
 * - 支持过滤交互元素
 * - 支持指定深度和子树焦点
 */

import { createErrorResponse, ToolResult } from '../core/tool-handler';
import { BaseBrowserToolExecutor } from '../core/base-browser';
import { TOOL_NAMES } from '../schemas/tool-schemas';
import { ERROR_MESSAGES } from '../core/constants';

// Content Script 消息类型
const TOOL_MESSAGE_TYPES = {
  GENERATE_ACCESSIBILITY_TREE: 'generateAccessibilityTree',
  GET_INTERACTIVE_ELEMENTS: 'getInteractiveElements',
};

interface ReadPageStats {
  processed: number;
  included: number;
  durationMs: number;
}

interface ReadPageParams {
  filter?: 'interactive'; // 仅返回交互元素
  depth?: number;         // 最大 DOM 深度
  refId?: string;         // 聚焦于特定 ref 的子树
  tabId?: number;         // 目标标签页 ID
  windowId?: number;      // 窗口 ID
}

/**
 * 页面读取工具
 * 
 * 返回页面的可访问性树，元素带有 ref_* 标识符，
 * 可用于后续的 click/fill 等交互操作。
 */
class ReadPageTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.READ_PAGE;

  async execute(args: ReadPageParams): Promise<ToolResult> {
    const { filter, depth, refId } = args || {};

    // 验证 refId 参数
    const focusRefId = typeof refId === 'string' ? refId.trim() : '';
    if (refId !== undefined && !focusRefId) {
      return createErrorResponse(
        `${ERROR_MESSAGES.INVALID_PARAMETERS}: refId must be a non-empty string`,
      );
    }

    // 验证 depth 参数
    const requestedDepth = depth === undefined ? undefined : Number(depth);
    if (requestedDepth !== undefined && (!Number.isInteger(requestedDepth) || requestedDepth < 0)) {
      return createErrorResponse(
        `${ERROR_MESSAGES.INVALID_PARAMETERS}: depth must be a non-negative integer`,
      );
    }

    // 用户是否显式控制了输出
    const userControlled = requestedDepth !== undefined || !!focusRefId;

    try {
      const standardTips =
        "If the specific element you need is missing, use screenshot to capture coordinates, then operate by coordinates.";

      const explicit = await this.tryGetTab(args?.tabId);
      const tab = explicit || (await this.getActiveTabOrThrowInWindow(args?.windowId));
      if (!tab.id)
        return createErrorResponse(ERROR_MESSAGES.TAB_NOT_FOUND + ': Active tab has no ID');

      // 注入可访问性树辅助脚本
      await this.injectContentScript(
        tab.id,
        ['inject-scripts/accessibility-tree-helper.js'],
        false,
        'ISOLATED',
        true,
      );

      // 请求生成可访问性树
      const resp = await this.sendMessageToTab(tab.id, {
        action: TOOL_MESSAGE_TYPES.GENERATE_ACCESSIBILITY_TREE,
        filter: filter || null,
        depth: requestedDepth,
        refId: focusRefId || undefined,
      });

      // 评估结果
      const treeOk = resp && resp.success === true;
      const pageContent: string =
        resp && typeof resp.pageContent === 'string' ? resp.pageContent : '';

      // 提取统计信息
      const stats: ReadPageStats | null =
        treeOk && resp?.stats
          ? {
              processed: resp.stats.processed ?? 0,
              included: resp.stats.included ?? 0,
              durationMs: resp.stats.durationMs ?? 0,
            }
          : null;

      const lines = pageContent
        ? pageContent.split('\n').filter((l: string) => l.trim().length > 0).length
        : 0;
      const refCount = Array.isArray(resp?.refMap) ? resp.refMap.length : 0;

      // 稀疏检测 (用户未显式控制时)
      const isSparse = !userControlled && lines < 10 && refCount < 3;

      // 构建统一的响应结构
      const basePayload: Record<string, any> = {
        success: true,
        filter: filter || 'all',
        pageContent,
        tips: standardTips,
        viewport: treeOk ? resp.viewport : { width: null, height: null, dpr: null },
        stats: stats || { processed: 0, included: 0, durationMs: 0 },
        refMapCount: refCount,
        sparse: treeOk ? isSparse : false,
        depth: requestedDepth ?? null,
        focus: focusRefId ? { refId: focusRefId, found: treeOk } : null,
        elements: [],
        count: 0,
        fallbackUsed: false,
        fallbackSource: null,
        reason: null,
      };

      // 正常路径: 返回树
      if (treeOk && !isSparse) {
        return {
          content: [{ type: 'text', text: JSON.stringify(basePayload) }],
          isError: false,
        };
      }

      // refId 显式提供时不回退
      if (focusRefId) {
        return createErrorResponse(resp?.error || `refId "${focusRefId}" not found or expired`);
      }

      // depth 显式控制时不回退
      if (requestedDepth !== undefined) {
        return createErrorResponse(resp?.error || 'Failed to generate accessibility tree');
      }

      // 回退: 尝试获取交互元素
      try {
        await this.injectContentScript(tab.id, ['inject-scripts/interactive-elements-helper.js']);
        const fallback = await this.sendMessageToTab(tab.id, {
          action: TOOL_MESSAGE_TYPES.GET_INTERACTIVE_ELEMENTS,
          includeCoordinates: true,
        });

        if (fallback && fallback.success && Array.isArray(fallback.elements)) {
          const limited = fallback.elements.slice(0, 150);
          
          basePayload.fallbackUsed = true;
          basePayload.fallbackSource = 'get_interactive_elements';
          basePayload.reason = treeOk ? 'sparse_tree' : resp?.error || 'tree_failed';
          basePayload.elements = limited;
          basePayload.count = fallback.elements.length;
          
          if (!basePayload.pageContent) {
            basePayload.pageContent = this.formatElementsAsPageContent(limited);
          }

          return {
            content: [{ type: 'text', text: JSON.stringify(basePayload) }],
            isError: false,
          };
        }
      } catch (fallbackErr) {
        console.warn('read_page fallback failed:', fallbackErr);
      }

      return createErrorResponse(
        treeOk
          ? 'Accessibility tree is too sparse and fallback failed'
          : resp?.error || 'Failed to generate accessibility tree',
      );
    } catch (error) {
      console.error('Error in read page tool:', error);
      return createErrorResponse(
        `Error generating accessibility tree: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 格式化元素列表为 pageContent 格式
   */
  private formatElementsAsPageContent(elements: any[]): string {
    const out: string[] = [];
    for (const e of elements || []) {
      const type = typeof e?.type === 'string' && e.type ? e.type : 'element';
      const rawText = typeof e?.text === 'string' ? e.text.trim() : '';
      const text =
        rawText.length > 0
          ? ` "${rawText.replace(/\s+/g, ' ').slice(0, 100).replace(/"/g, '\\"')}"`
          : '';
      const selector =
        typeof e?.selector === 'string' && e.selector ? ` selector="${e.selector}"` : '';
      const coords =
        e?.coordinates && Number.isFinite(e.coordinates.x) && Number.isFinite(e.coordinates.y)
          ? ` (x=${Math.round(e.coordinates.x)},y=${Math.round(e.coordinates.y)})`
          : '';
      out.push(`- ${type}${text}${selector}${coords}`);
      if (out.length >= 150) break;
    }
    return out.join('\n');
  }
}

export const readPageTool = new ReadPageTool();
