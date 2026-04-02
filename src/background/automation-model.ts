/**
 * 只读工具定义
 * - getToolDefinitions: 提供给标准工具调用的只读工具
 * - validateToolCall: 对模型输出的工具调用做轻量校验
 */

import type { ToolCall, ToolName } from '@/shared/types';

const READ_ONLY_TOOLS: Set<ToolName> = new Set([
  'getPageInfo',
  'getVisibleText',
  'query',
  'findByText',
  'getValue',
]);

/**
 * 生成标准 OpenAI tools 定义
 */
export function getToolDefinitions() {
  return [
    {
      type: 'function',
      function: {
        name: 'getPageInfo',
        description: '获取当前页面的基础信息，如 URL 和标题',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'getVisibleText',
        description: '提取页面完整可见文本内容，用于理解页面上下文',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'query',
        description:
          '使用 CSS 选择器或 XPath 查询页面元素，返回元素列表及 elementId 供后续读取使用',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description:
                'CSS 选择器或 XPath 表达式。不要使用 :contains() 等 jQuery 风格伪选择器',
            },
            selectorType: {
              type: 'string',
              enum: ['css', 'xpath'],
              description: '选择器类型，默认 css',
            },
          },
          required: ['selector'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'findByText',
        description: '通过可见文本查找页面元素，便于进一步读取值或属性',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: '要查找的文本内容，支持部分匹配',
            },
            role: {
              type: 'string',
              enum: ['button', 'link'],
              description: '限定元素角色类型（可选）',
            },
          },
          required: ['text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'getValue',
        description: '读取元素的 value、textContent、checked 状态或指定 attribute',
        parameters: {
          type: 'object',
          properties: {
            elementId: {
              type: 'string',
              description: '元素 ID，推荐使用 query/findByText 返回的 elementId',
            },
            selector: {
              type: 'string',
              description: 'CSS 选择器或 XPath 表达式',
            },
            selectorType: {
              type: 'string',
              enum: ['css', 'xpath'],
              description: '选择器类型，默认 css',
            },
            attribute: {
              type: 'string',
              description: '指定要读取的属性名，如 href、src、data-id',
            },
          },
          required: [],
        },
      },
    },
  ];
}

/**
 * 旧的 Prompt-based 工具规范（保留供兼容旧调用方式）
 * @deprecated 新的工具调用实现请使用 getToolDefinitions()
 */
export function toolSpecText(): string {
  return [
    'You are a read-only webpage analysis agent inside a Chrome/Edge extension.',
    'You MUST output a single JSON object only (no extra text).',
    'Output schema:',
    '1) Next tool call: {"tool":"<ToolName>","args":{...}}',
    '2) Final answer: {"final":"..."}',
    '',
    'Available tools (ToolName) and args:',
    '- getPageInfo: {}',
    '- getVisibleText: {}',
    '- findByText: { "text": string, "role"?: "button" }',
    '- query: { "selector": string, "selectorType"?: "css"|"xpath" }',
    '- getValue: { "elementId"?: string, "selector"?: string, "selectorType"?: "css"|"xpath", "attribute"?: string }',
    '',
    'Rules:',
    '- Read-only only: never attempt to click, type, navigate, download, or mutate the page.',
    '- Prefer elementId returned by query/findByText over raw selectors when reading a specific element.',
    '- Use the minimum number of tool calls needed to answer the user question.',
  ].join('\n');
}

/**
 * 旧的 JSON 解析器（保留供兼容旧调用方式）
 * @deprecated 新的工具调用实现不需要此函数
 */
export function parseModelJson(text: string): any {
  const fence = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fence?.[1] ?? text;

  try {
    return JSON.parse(candidate);
  } catch {}

  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return JSON.parse(candidate.slice(first, last + 1));
  }

  throw new Error('Model output is not valid JSON');
}

export function validateToolCall(call: ToolCall): { ok: true } | { ok: false; reason: string } {
  if (!call || typeof call !== 'object') return { ok: false, reason: 'call is not an object' };
  const tool = (call as any).tool;
  if (typeof tool !== 'string') return { ok: false, reason: 'missing tool' };
  if (!READ_ONLY_TOOLS.has(tool as ToolName)) return { ok: false, reason: `tool is not allowed in read-only mode: ${tool}` };

  const args = (call as any).args;
  if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
    return { ok: false, reason: 'args must be an object' };
  }

  // minimal per-tool required args
  if (tool === 'query' && !args?.selector) return { ok: false, reason: 'query requires selector' };
  if (tool === 'findByText' && !args?.text) return { ok: false, reason: 'findByText requires text' };
  if (tool === 'getValue' && !args?.elementId && !args?.selector) return { ok: false, reason: 'getValue requires elementId or selector' };

  return { ok: true };
}


