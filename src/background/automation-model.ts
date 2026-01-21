/**
 * Browser Use (路线A) - 标准 Function Calling 工具定义
 * - getToolDefinitions: 生成标准 OpenAI Function Calling tools 定义
 * - validateToolCall: 对 tool call 做轻量校验
 */

import type { ToolCall, ToolName } from '@/shared/types';

/**
 * 生成标准 OpenAI Function Calling tools 定义
 */
export function getToolDefinitions() {
  return [
    {
      type: 'function',
      function: {
        name: 'getPageInfo',
        description: '获取当前页面的基本信息（URL、标题、是否有 iframe 等）',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'getVisibleText',
        description: '提取页面可见文本内容，用于理解页面上下文',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: '返回文本的最大字符数，默认 4000'
            }
          },
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'query',
        description: '使用 CSS 选择器查询页面元素，返回元素列表及其 elementId（供后续工具使用）',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS 选择器，例如 "#submit", ".btn-primary", "input[name=\'username\']"'
            }
          },
          required: ['selector']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'findByText',
        description: '通过可见文本查找页面元素（按钮、链接等）',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: '要查找的文本内容，支持部分匹配'
            },
            role: {
              type: 'string',
              enum: ['button', 'link'],
              description: '限定元素角色类型（可选）'
            }
          },
          required: ['text']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'click',
        description: '点击页面元素。优先使用 elementId（通过 query/findByText 获取）。高风险操作（提交、下载）会自动要求用户确认',
        parameters: {
          type: 'object',
          properties: {
            elementId: {
              type: 'string',
              description: '元素 ID（推荐，通过 query/findByText 返回）'
            },
            selector: {
              type: 'string',
              description: 'CSS 选择器（备用方案）'
            },
            force: {
              type: 'boolean',
              description: '强制点击不可见或禁用的元素，默认 false'
            }
          },
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'type',
        description: '在输入框中输入文本内容',
        parameters: {
          type: 'object',
          properties: {
            elementId: {
              type: 'string',
              description: '元素 ID'
            },
            selector: {
              type: 'string',
              description: 'CSS 选择器'
            },
            text: {
              type: 'string',
              description: '要输入的文本内容'
            },
            clear: {
              type: 'boolean',
              description: '输入前是否清空已有内容，默认 false'
            }
          },
          required: ['text']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'scroll',
        description: '滚动页面或指定的可滚动元素',
        parameters: {
          type: 'object',
          properties: {
            amount: {
              type: 'number',
              description: '滚动距离（像素），正数向下，负数向上，默认 300'
            },
            elementId: {
              type: 'string',
              description: '要滚动的元素 ID（可选，默认滚动页面）'
            },
            selector: {
              type: 'string',
              description: '要滚动的元素选择器（可选）'
            }
          },
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'waitFor',
        description: '等待元素出现或消失（用于处理动态加载内容）',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS 选择器'
            },
            state: {
              type: 'string',
              enum: ['attached', 'detached'],
              description: '等待状态：attached=出现，detached=消失，默认 attached'
            },
            timeout: {
              type: 'number',
              description: '超时时间（毫秒），默认 5000'
            }
          },
          required: ['selector']
        }
      }
    }
  ];
}

/**
 * 旧的 Prompt-based 工具规范（保留供 AutomationOrchestrator 使用）
 * @deprecated 新的 Function Calling 实现请使用 getToolDefinitions()
 */
export function toolSpecText(): string {
  return [
    'You are a browser automation agent inside a Chrome/Edge extension.',
    'You MUST output a single JSON object only (no extra text).',
    'Output schema:',
    '1) Next tool call: {"tool":"<ToolName>","args":{...}}',
    '2) Final answer: {"final":"..."}',
    '',
    'Available tools (ToolName) and args:',
    '- getPageInfo: {}',
    '- getVisibleText: { "limit"?: number }',
    '- query: { "selector": string }',
    '- findByText: { "text": string, "role"?: "button" }',
    '- click: { "elementId"?: string, "selector"?: string, "force"?: boolean }',
    '- type: { "elementId"?: string, "selector"?: string, "text": string, "clear"?: boolean }',
    '- scroll: { "amount"?: number, "elementId"?: string, "selector"?: string }',
    '- waitFor: { "selector": string, "state"?: "attached"|"detached", "timeout"?: number }',
    '',
    'Rules:',
    '- Prefer elementId returned by query/findByText over raw selectors.',
    '- Keep steps minimal and robust (use waitFor when needed).',
    '- High-risk actions (submit/download) require confirmation; you may call click normally, the system will pause if confirmation is required.',
  ].join('\n');
}

/**
 * 旧的 JSON 解析器（保留供 AutomationOrchestrator 使用）
 * @deprecated 新的 Function Calling 实现不需要此函数
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

const TOOL_SET: Set<ToolName> = new Set([
  'getPageInfo',
  'getVisibleText',
  'query',
  'findByText',
  'click',
  'type',
  'scroll',
  'waitFor',
]);

export function validateToolCall(call: ToolCall): { ok: true } | { ok: false; reason: string } {
  if (!call || typeof call !== 'object') return { ok: false, reason: 'call is not an object' };
  const tool = (call as any).tool;
  if (typeof tool !== 'string') return { ok: false, reason: 'missing tool' };
  if (!TOOL_SET.has(tool as ToolName)) return { ok: false, reason: `unknown tool: ${tool}` };

  const args = (call as any).args;
  if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
    return { ok: false, reason: 'args must be an object' };
  }

  // minimal per-tool required args
  if (tool === 'query' && !args?.selector) return { ok: false, reason: 'query requires selector' };
  if (tool === 'findByText' && !args?.text) return { ok: false, reason: 'findByText requires text' };
  if (tool === 'type' && typeof args?.text !== 'string') return { ok: false, reason: 'type requires text string' };
  if (tool === 'waitFor' && !args?.selector) return { ok: false, reason: 'waitFor requires selector' };
  if (tool === 'click' && !args?.elementId && !args?.selector) return { ok: false, reason: 'click requires elementId or selector' };

  return { ok: true };
}


