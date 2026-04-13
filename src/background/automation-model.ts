/**
 * 自动化工具定义
 * - getToolDefinitions: 提供给标准工具调用的自动化工具
 * - validateToolCall: 对模型输出的工具调用做轻量校验
 */

import type { ToolCall, ToolName } from '@/shared/types';

const AUTOMATION_TOOLS: Set<ToolName> = new Set([
  'getPageInfo',
  'readAriaTree',
  'resolveAriaRef',
  'ariaInspect',
  'ariaInteract',
  'waitForAria',
  'query',
  'findByText',
  'getValue',
  'inspectElement',
  'interact',
  'waitFor',
  'screenshotPage',
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
        name: 'readAriaTree',
        description: '读取页面或局部子树的可访问性树快照，返回 ref 可供后续交互使用',
        parameters: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              enum: ['all', 'interactive'],
              description: 'all 返回完整语义树，interactive 只保留可交互节点',
            },
            depth: {
              type: 'number',
              description: '限制树深度，避免大页面快照过大',
            },
            ref: {
              type: 'string',
              description: '从指定 ref 对应节点开始读取局部子树',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resolveAriaRef',
        description: '校验 ref 是否仍有效，并返回该 ref 对应的节点摘要',
        parameters: {
          type: 'object',
          properties: {
            ref: {
              type: 'string',
              description: 'readAriaTree 返回的 ref',
            },
          },
          required: ['ref'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ariaInspect',
        description: '读取指定 ref 节点的 role、name、状态、值和附近语义上下文',
        parameters: {
          type: 'object',
          properties: {
            ref: { type: 'string' },
          },
          required: ['ref'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ariaInteract',
        description: '基于 ARIA ref 执行单个低风险动作：click、type、press、selectOption',
        parameters: {
          type: 'object',
          properties: {
            ref: { type: 'string' },
            action: { type: 'string', enum: ['click', 'type', 'press', 'selectOption'] },
            text: { type: 'string' },
            key: { type: 'string' },
            value: { type: 'string' },
            label: { type: 'string' },
            mode: { type: 'string', enum: ['replace', 'append'] },
          },
          required: ['ref', 'action'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'waitForAria',
        description: '等待指定 ref 仍可用，或等待 aria 条件稳定/消失',
        parameters: {
          type: 'object',
          properties: {
            ref: { type: 'string' },
            name: { type: 'string' },
            role: { type: 'string' },
            state: { type: 'string', enum: ['appear', 'disappear', 'stable'] },
            timeoutMs: { type: 'number' },
          },
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
        description: '通过可见文本查找页面元素。查字段时可传 role=field，优先匹配 label、placeholder、name 和附近文本',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: '要查找的文本内容，支持部分匹配',
            },
            role: {
              type: 'string',
              enum: ['button', 'link', 'field'],
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
            targetText: {
              type: 'string',
              description: '目标字段或按钮的可见文本/标签文本，适合直接按表单标签定位',
            },
            targetRole: {
              type: 'string',
              enum: ['field', 'button', 'link'],
              description: '按文本定位时的目标角色类型',
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
    {
      type: 'function',
      function: {
        name: 'inspectElement',
        description: '读取元素的标签、状态、值和附近文本',
        parameters: {
          type: 'object',
          properties: {
            elementId: { type: 'string' },
            selector: { type: 'string' },
            selectorType: { type: 'string', enum: ['css', 'xpath'] },
            targetText: { type: 'string' },
            targetRole: { type: 'string', enum: ['field', 'button', 'link'] },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'interact',
        description: '执行单个低风险动作：click、type、press、selectOption',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['click', 'type', 'press', 'selectOption'] },
            elementId: { type: 'string' },
            selector: { type: 'string' },
            selectorType: { type: 'string', enum: ['css', 'xpath'] },
            targetText: { type: 'string' },
            targetRole: { type: 'string', enum: ['field', 'button', 'link'] },
            text: { type: 'string' },
            key: { type: 'string' },
            value: { type: 'string' },
            label: { type: 'string' },
            mode: { type: 'string', enum: ['replace', 'append'] },
          },
          required: ['action'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'waitFor',
        description: '等待元素、文本或页面状态稳定',
        parameters: {
          type: 'object',
          properties: {
            selector: { type: 'string' },
            selectorType: { type: 'string', enum: ['css', 'xpath'] },
            text: { type: 'string' },
            state: { type: 'string', enum: ['appear', 'disappear', 'stable'] },
            timeoutMs: { type: 'number' },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'screenshotPage',
        description: '截图当前页面或用户已选中的目标元素，默认 fullpage。适合把页面视觉内容作为图片提供给多模态模型',
        parameters: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['fullpage', 'viewport'],
              description: '截图模式，默认 fullpage',
            },
            target: {
              type: 'string',
              enum: ['page', 'element'],
              description: '截图目标类型，默认 page',
            },
            elementId: {
              type: 'string',
              description: '用户预先选择的目标元素 ID，仅在 target=element 时使用',
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
    'You are a low-risk browser automation agent inside a Chrome/Edge extension.',
    'You MUST output a single JSON object only (no extra text).',
    'Output schema:',
    '1) Next tool call: {"tool":"<ToolName>","args":{...}}',
    '2) Final answer: {"final":"..."}',
    '',
    'Available tools (ToolName) and args:',
    '- getPageInfo: {}',
    '- readAriaTree: { "filter"?: "all"|"interactive", "depth"?: number, "ref"?: string }',
    '- resolveAriaRef: { "ref": string }',
    '- ariaInspect: { "ref": string }',
    '- ariaInteract: { "ref": string, "action": "click"|"type"|"press"|"selectOption", "text"?: string, "key"?: string, "value"?: string, "label"?: string, "mode"?: "replace"|"append" }',
    '- waitForAria: { "ref"?: string, "name"?: string, "role"?: string, "state"?: "appear"|"disappear"|"stable", "timeoutMs"?: number }',
    '- findByText: { "text": string, "role"?: "button"|"link"|"field" }',
    '- query: { "selector": string, "selectorType"?: "css"|"xpath" }',
    '- getValue: { "elementId"?: string, "selector"?: string, "selectorType"?: "css"|"xpath", "targetText"?: string, "targetRole"?: "field"|"button"|"link", "attribute"?: string }',
    '- inspectElement: { "elementId"?: string, "selector"?: string, "selectorType"?: "css"|"xpath", "targetText"?: string, "targetRole"?: "field"|"button"|"link" }',
    '- interact: { "action": "click"|"type"|"press"|"selectOption", "elementId"?: string, "selector"?: string, "selectorType"?: "css"|"xpath", "targetText"?: string, "targetRole"?: "field"|"button"|"link", "text"?: string, "key"?: string, "value"?: string, "label"?: string, "mode"?: "replace"|"append" }',
    '- waitFor: { "selector"?: string, "selectorType"?: "css"|"xpath", "text"?: string, "state"?: "appear"|"disappear"|"stable", "timeoutMs"?: number }',
    '- screenshotPage: { "mode"?: "fullpage"|"viewport", "target"?: "page"|"element", "elementId"?: string }',
    '',
    'Rules:',
    '- Prefer low-risk browser actions only. Read page state before acting.',
    '- For common form fields, prefer targetText + targetRole="field" to directly locate the control by its label.',
    '- Prefer elementId returned by query/findByText over raw selectors when reading a specific element.',
    '- Use screenshotPage when visual layout, chart, style, or screenshot evidence matters.',
    '- Use element screenshot mode only when the user has already selected a target element.',
    '- After an action, validate the outcome before deciding the next step.',
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
  if (!AUTOMATION_TOOLS.has(tool as ToolName)) return { ok: false, reason: `tool is not allowed in automation mode: ${tool}` };

  const args = (call as any).args;
  if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
    return { ok: false, reason: 'args must be an object' };
  }

  // minimal per-tool required args
  if (tool === 'resolveAriaRef' && !args?.ref) return { ok: false, reason: 'resolveAriaRef requires ref' };
  if (tool === 'ariaInspect' && !args?.ref) return { ok: false, reason: 'ariaInspect requires ref' };
  if (tool === 'ariaInteract' && !args?.ref) return { ok: false, reason: 'ariaInteract requires ref' };
  if (tool === 'ariaInteract' && !args?.action) return { ok: false, reason: 'ariaInteract requires action' };
  if (tool === 'waitForAria' && !args?.ref && !args?.name && !args?.role) return { ok: false, reason: 'waitForAria requires ref, name or role' };
  if (tool === 'query' && !args?.selector) return { ok: false, reason: 'query requires selector' };
  if (tool === 'findByText' && !args?.text) return { ok: false, reason: 'findByText requires text' };
  if (tool === 'getValue' && !args?.elementId && !args?.selector && !args?.targetText) return { ok: false, reason: 'getValue requires elementId, selector or targetText' };
  if (tool === 'inspectElement' && !args?.elementId && !args?.selector && !args?.targetText) return { ok: false, reason: 'inspectElement requires elementId, selector or targetText' };
  if (tool === 'interact' && !args?.action) return { ok: false, reason: 'interact requires action' };
  if (tool === 'screenshotPage' && args?.target === 'element' && !args?.elementId) return { ok: false, reason: 'screenshotPage element target requires elementId' };

  return { ok: true };
}


