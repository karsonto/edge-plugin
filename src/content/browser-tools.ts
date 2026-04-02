/**
 * Content Script 只读工具执行器
 * 仅保留页面理解 / 读取相关能力，禁止页面交互和浏览器控制。
 */

import type { ElementSummary, ToolCall, ToolName, ToolResult } from '@/shared/types';
import { extractAllVisibleText, truncateText } from '@/shared/utils/text-processor';
import { isElementVisible, resolveSelector, resolveSelectorAll } from '@/shared/utils/dom-utils';
import { TOOL_ERRORS } from '@/shared/constants';

type StoredElement = { el: Element; createdAt: number };

const elementStore = new Map<string, StoredElement>();
let elementSeq = 0;

function now() {
  return Date.now();
}

function hashText(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

function makeObservations(): ToolResult['observations'] {
  try {
    const text = extractAllVisibleText(document);
    const snippet = truncateText(text, 800);
    return {
      url: location.href,
      title: document.title,
      visibleTextHash: hashText(snippet),
    };
  } catch {
    return { url: location.href, title: document.title };
  }
}

function cssEscape(s: string) {
  return s.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

function getRect(el: Element) {
  const r = (el as HTMLElement).getBoundingClientRect?.();
  if (!r) return undefined;
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

function getLabelText(el: Element): string | undefined {
  const ariaLabelledBy = (el.getAttribute('aria-labelledby') || '').trim();
  if (ariaLabelledBy) {
    const ids = ariaLabelledBy.split(/\s+/).filter(Boolean);
    const t = ids
      .map((id) => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (t) return t.slice(0, 120);
  }

  const id = el.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${cssEscape(id)}"]`) as HTMLLabelElement | null;
    const t = (label?.innerText || label?.textContent || '').replace(/\s+/g, ' ').trim();
    if (t) return t.slice(0, 120);
  }

  const wrapLabel = el.closest('label');
  if (wrapLabel) {
    const t = ((wrapLabel as HTMLElement).innerText || wrapLabel.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (t) return t.slice(0, 120);
  }

  return undefined;
}

function pruneStore(maxAgeMs: number = 5 * 60 * 1000) {
  const cutoff = now() - maxAgeMs;
  for (const [id, entry] of elementStore.entries()) {
    if (entry.createdAt < cutoff) elementStore.delete(id);
  }
}

function storeElement(el: Element): string {
  pruneStore();
  const id = `el_${now()}_${(elementSeq++).toString(36)}`;
  elementStore.set(id, { el, createdAt: now() });
  return id;
}

function getStoredElement(id?: string): Element | null {
  if (!id) return null;
  return elementStore.get(id)?.el || null;
}

function buildSelectorHint(el: Element): string | undefined {
  const id = el.getAttribute('id');
  if (id) return `#${cssEscape(id)}`;

  const testId =
    el.getAttribute('data-testid') ||
    el.getAttribute('data-test-id') ||
    el.getAttribute('data-test');
  if (testId) return `[data-testid="${cssEscape(testId)}"]`;

  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && depth < 4 && cur.tagName.toLowerCase() !== 'html') {
    const tag = cur.tagName.toLowerCase();
    const classes = Array.from(cur.classList || [])
      .slice(0, 2)
      .map((c) => `.${cssEscape(c)}`)
      .join('');
    const parentEl: Element | null = cur.parentElement;
    let nth = '';
    if (parentEl) {
      const siblings = Array.from(parentEl.children).filter(
        (c) => (c as Element).tagName === cur!.tagName
      );
      if (siblings.length > 1) {
        nth = `:nth-of-type(${siblings.indexOf(cur) + 1})`;
      }
    }
    parts.unshift(`${tag}${classes}${nth}`);
    cur = parentEl;
    depth++;
  }
  return parts.length > 0 ? parts.join(' > ') : undefined;
}

function summarizeElement(el: Element): Omit<ElementSummary, 'id'> {
  const htmlEl = el as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const input = el as HTMLInputElement;
  const text =
    (htmlEl.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) || undefined;

  return {
    tag,
    role: el.getAttribute('role') || undefined,
    text,
    labelText: getLabelText(el),
    name: (input as any).name || el.getAttribute('name') || undefined,
    placeholder: (input as any).placeholder || el.getAttribute('placeholder') || undefined,
    inputType: tag === 'input' ? input.type || 'text' : undefined,
    selectorHint: buildSelectorHint(el),
    rect: getRect(el),
  };
}

function isButtonLike(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'button' || tag === 'a') return true;
  if (tag === 'input') {
    const t = (el as HTMLInputElement).type?.toLowerCase();
    return t === 'button' || t === 'submit' || t === 'reset';
  }
  return el.getAttribute('role') === 'button';
}

function resolveTargetElement(args: any): Element | null {
  if (args?.elementId) {
    const byId = getStoredElement(args.elementId);
    if (byId) return byId;
  }

  const selector = (args?.selector as string | undefined)?.trim();
  if (!selector) return null;

  const selectorType = (args?.selectorType as 'css' | 'xpath' | undefined) || 'css';
  return resolveSelector(selector, selectorType);
}

function tool_getPageInfo(): ToolResult<{ url: string; title: string }> {
  return {
    ok: true,
    tool: 'getPageInfo',
    data: { url: location.href, title: document.title },
    observations: makeObservations(),
  };
}

function tool_getVisibleText(): ToolResult<{ text: string }> {
  return {
    ok: true,
    tool: 'getVisibleText',
    data: { text: extractAllVisibleText(document) },
    observations: makeObservations(),
  };
}

function tool_query(args: any): ToolResult<{ elements: ElementSummary[] }> {
  const selector = (args?.selector as string | undefined)?.trim();
  if (!selector) {
    return { ok: false, tool: 'query', error: `${TOOL_ERRORS.MISSING_REQUIRED_PARAM}: selector` };
  }

  const selectorType = (args?.selectorType as 'css' | 'xpath' | undefined) || 'css';
  if (selectorType !== 'css' && selectorType !== 'xpath') {
    return { ok: false, tool: 'query', error: TOOL_ERRORS.SELECTOR_TYPE_NOT_SUPPORTED };
  }

  try {
    const elements = resolveSelectorAll(selector, selectorType)
      .filter(isElementVisible)
      .slice(0, 20)
      .map((el) => {
        const id = storeElement(el);
        return { id, ...summarizeElement(el) };
      });

    return { ok: true, tool: 'query', data: { elements }, observations: makeObservations() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes(':contains(') ||
      message.includes('jQuery') ||
      message.includes('pseudo-selectors')
    ) {
      return {
        ok: false,
        tool: 'query',
        error: `${message} 提示：如果要按文本查找元素，请使用 findByText，或切换到 XPath`,
      };
    }
    return { ok: false, tool: 'query', error: message };
  }
}

function tool_findByText(args: any): ToolResult<{ elements: ElementSummary[] }> {
  const text = (args?.text as string | undefined)?.trim();
  if (!text) return { ok: false, tool: 'findByText', error: 'Missing text' };

  const role = (args?.role as string | undefined)?.toLowerCase();
  const wanted = text.toLowerCase();
  const scored: Array<{ el: Element; score: number }> = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);

  let n: Node | null = walker.nextNode();
  while (n) {
    const el = n as Element;
    if (!isElementVisible(el)) {
      n = walker.nextNode();
      continue;
    }
    if (role === 'button' && !isButtonLike(el)) {
      n = walker.nextNode();
      continue;
    }

    const htmlEl = el as HTMLElement;
    const inner = (htmlEl.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
    const title = (el.getAttribute('title') || '').trim().toLowerCase();
    const placeholder = (el.getAttribute('placeholder') || '').trim().toLowerCase();
    const value =
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        ? (el.value || '').trim().toLowerCase()
        : '';
    const name = (el.getAttribute('name') || '').trim().toLowerCase();
    const label = (getLabelText(el) || '').trim().toLowerCase();

    const fields = [inner, aria, title, placeholder, label, name, value].filter(Boolean);
    const hay = fields.join(' | ');
    if (hay.includes(wanted)) {
      let score = 0;
      for (const field of fields) {
        if (field === wanted) score = Math.max(score, 100);
        else if (field.startsWith(wanted)) score = Math.max(score, 80);
        else if (field.includes(wanted)) score = Math.max(score, 60);
      }
      if (role === 'button' && isButtonLike(el)) score += 10;
      scored.push({ el, score });
    }

    n = walker.nextNode();
  }

  const elements = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(({ el }) => {
      const id = storeElement(el);
      return { id, ...summarizeElement(el) };
    });

  return { ok: true, tool: 'findByText', data: { elements }, observations: makeObservations() };
}

function tool_getValue(
  args: any
): ToolResult<{ value?: string; text?: string; checked?: boolean; attribute?: string }> {
  const el = resolveTargetElement(args);
  if (!el) {
    let errorMsg = 'Target element not found. ';
    if (args?.elementId) {
      errorMsg += `elementId: ${args.elementId} 可能已过期，请重新用 query 或 findByText 查找`;
    } else if (args?.selector) {
      errorMsg += `选择器 "${args.selector}" 未找到元素`;
    } else {
      errorMsg += '请提供 elementId 或 selector';
    }
    return { ok: false, tool: 'getValue', error: errorMsg };
  }

  const attr = args.attribute;
  if (attr) {
    return {
      ok: true,
      tool: 'getValue',
      data: { attribute: attr, value: el.getAttribute(attr) || undefined },
      observations: makeObservations(),
    };
  }

  const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    if (
      tag === 'input' &&
      ((input as HTMLInputElement).type === 'checkbox' || (input as HTMLInputElement).type === 'radio')
    ) {
      return {
        ok: true,
        tool: 'getValue',
        data: { value: input.value, checked: (input as HTMLInputElement).checked },
        observations: makeObservations(),
      };
    }

    return {
      ok: true,
      tool: 'getValue',
      data: { value: input.value },
      observations: makeObservations(),
    };
  }

  return {
    ok: true,
    tool: 'getValue',
    data: { text: ((el as HTMLElement).innerText || el.textContent || '').trim() },
    observations: makeObservations(),
  };
}

export async function executeTool(call: ToolCall): Promise<ToolResult> {
  const tool = call.tool as ToolName;
  const args = call.args || {};

  try {
    switch (tool) {
      case 'getPageInfo':
        return tool_getPageInfo();
      case 'getVisibleText':
        return tool_getVisibleText();
      case 'query':
        return tool_query(args);
      case 'findByText':
        return tool_findByText(args);
      case 'getValue':
        return tool_getValue(args);
      default:
        return {
          ok: false,
          tool,
          error: `Tool "${String(tool)}" has been removed. Only read-only tools are available.`,
        };
    }
  } catch (error) {
    return {
      ok: false,
      tool,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}


