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
        description: '提取页面完整可见文本内容（包括表单值、iframe内容），用于理解页面上下文。返回完整文本，无字数限制',
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
    },
    // ============ 新增工具 ============
    {
      type: 'function',
      function: {
        name: 'select',
        description: '从下拉选择框中选择选项，支持原生 <select> 和常见 UI 框架（Ant Design、Element UI 等）',
        parameters: {
          type: 'object',
          properties: {
            elementId: {
              type: 'string',
              description: '元素 ID（通过 query/findByText 获取）'
            },
            selector: {
              type: 'string',
              description: 'CSS 选择器'
            },
            value: {
              type: 'string',
              description: '选项的 value 属性值'
            },
            text: {
              type: 'string',
              description: '选项的显示文本（模糊匹配）'
            },
            index: {
              type: 'number',
              description: '选项索引（从 0 开始）'
            }
          },
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'check',
        description: '勾选或取消勾选复选框/开关，支持原生 checkbox 和 UI 框架的 Switch 组件',
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
            checked: {
              type: 'boolean',
              description: '目标状态：true=勾选，false=取消勾选。不传则切换当前状态'
            }
          },
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'hover',
        description: '鼠标悬停在元素上，触发 hover 效果（展开菜单、显示 Tooltip 等）',
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
            duration: {
              type: 'number',
              description: '悬停等待时长（毫秒），默认 300'
            }
          },
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'pressKey',
        description: '模拟键盘按键，支持 Enter、Escape、Tab、方向键等',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              enum: ['Enter', 'Escape', 'Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Delete', 'Space'],
              description: '按键名称'
            },
            elementId: {
              type: 'string',
              description: '目标元素 ID（可选，默认当前焦点元素）'
            },
            selector: {
              type: 'string',
              description: 'CSS 选择器'
            },
            modifiers: {
              type: 'object',
              description: '修饰键',
              properties: {
                ctrl: { type: 'boolean' },
                shift: { type: 'boolean' },
                alt: { type: 'boolean' }
              }
            }
          },
          required: ['key']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'getValue',
        description: '获取元素的值或属性，用于读取表单当前值、链接地址、data 属性等',
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
            attribute: {
              type: 'string',
              description: '要获取的属性名（如 href、src、data-id）。不传则获取 value/textContent'
            }
          },
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'screenshot',
        description: '截取网页的视觉截图保存为图片。仅用于保存页面外观/布局的图像，不要用于保存文本内容。如果用户需要保存文字、回答、文档内容，请使用 download 工具',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['visible', 'fullpage'],
              description: '截图类型：visible=当前可见区域，fullpage=全页面长截图。默认 visible'
            },
            selector: {
              type: 'string',
              description: '只截取指定元素（可选）'
            },
            format: {
              type: 'string',
              enum: ['png', 'jpeg'],
              description: '图片格式，默认 png'
            },
            quality: {
              type: 'number',
              description: 'JPEG 质量 0-100，默认 90'
            },
            saveToLocal: {
              type: 'boolean',
              description: '是否保存到本地，默认 true'
            },
            filename: {
              type: 'string',
              description: '文件名（不含扩展名）'
            }
          },
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'download',
        description: '保存内容为文件并下载到本地。【重要】当用户要求"保存内容"、"下载回答"、"导出文本"、"保存为文件"时，必须使用此工具。支持：1) 保存 AI 生成的文本/回答 2) 保存网页文字内容 3) 下载网页上的图片资源',
        parameters: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: '【推荐】要保存的文本内容。用于保存 AI 回答、网页文字等'
            },
            url: {
              type: 'string',
              description: '要下载的资源 URL（用于下载图片、文件等网络资源）'
            },
            filename: {
              type: 'string',
              description: '保存的文件名（含扩展名），如 "summary.txt"、"data.json"、"report.md"'
            },
            contentType: {
              type: 'string',
              enum: ['text/plain', 'application/json', 'text/csv', 'text/markdown', 'text/html'],
              description: '内容类型，默认 text/plain。markdown 内容建议用 text/markdown'
            },
            elementId: {
              type: 'string',
              description: '下载指定元素的资源（如 <img> 的图片）'
            },
            selector: {
              type: 'string',
              description: 'CSS 选择器，下载匹配元素的资源'
            }
          },
          required: []
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
    '- getVisibleText: {}  // 返回完整页面文本，无字数限制',
    '- query: { "selector": string }',
    '- findByText: { "text": string, "role"?: "button" }',
    '- click: { "elementId"?: string, "selector"?: string, "force"?: boolean }',
    '- type: { "elementId"?: string, "selector"?: string, "text": string, "clear"?: boolean }',
    '- scroll: { "amount"?: number, "elementId"?: string, "selector"?: string }',
    '- waitFor: { "selector": string, "state"?: "attached"|"detached", "timeout"?: number }',
    '- select: { "elementId"?: string, "selector"?: string, "value"?: string, "text"?: string, "index"?: number }',
    '- check: { "elementId"?: string, "selector"?: string, "checked"?: boolean }',
    '- hover: { "elementId"?: string, "selector"?: string, "duration"?: number }',
    '- pressKey: { "key": string, "elementId"?: string, "selector"?: string, "modifiers"?: { "ctrl"?: boolean, "shift"?: boolean, "alt"?: boolean } }',
    '- getValue: { "elementId"?: string, "selector"?: string, "attribute"?: string }',
    '- screenshot: { "type"?: "visible"|"fullpage", "selector"?: string, "format"?: "png"|"jpeg", "quality"?: number, "download"?: boolean, "filename"?: string }',
    '- download: { "url"?: string, "content"?: string, "filename"?: string, "contentType"?: string, "elementId"?: string, "selector"?: string }',
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
  // 新增工具
  'select',
  'check',
  'hover',
  'pressKey',
  'getValue',
  'screenshot',
  'download',
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
  
  // 新增工具验证
  if (tool === 'select' && !args?.elementId && !args?.selector) return { ok: false, reason: 'select requires elementId or selector' };
  if (tool === 'check' && !args?.elementId && !args?.selector) return { ok: false, reason: 'check requires elementId or selector' };
  if (tool === 'hover' && !args?.elementId && !args?.selector) return { ok: false, reason: 'hover requires elementId or selector' };
  if (tool === 'pressKey' && !args?.key) return { ok: false, reason: 'pressKey requires key' };
  if (tool === 'getValue' && !args?.elementId && !args?.selector) return { ok: false, reason: 'getValue requires elementId or selector' };
  if (tool === 'download' && !args?.url && !args?.content && !args?.elementId && !args?.selector) {
    return { ok: false, reason: 'download requires url, content, elementId, or selector' };
  }

  return { ok: true };
}


