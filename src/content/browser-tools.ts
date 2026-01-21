/**
 * Browser Use (路线A) - Content Script 工具执行器
 * 负责在页面内执行 DOM 查询与交互，并返回结构化结果给 background。
 */

import type { ElementSummary, ToolCall, ToolName, ToolResult, WaitForState } from '@/shared/types';
import { extractAllVisibleText, truncateText } from '@/shared/utils/text-processor';
import { isElementVisible } from '@/shared/utils/dom-utils';
import { showHighlight } from './overlay';

type StoredElement = { el: Element; createdAt: number };

const elementStore = new Map<string, StoredElement>();
let elementSeq = 0;

function now() {
  return Date.now();
}

function hashText(input: string): string {
  // djb2
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

function waitForDomStable(timeoutMs = 800, idleMs = 160): Promise<boolean> {
  return new Promise((resolve) => {
    let lastChange = now();
    const obs = new MutationObserver(() => {
      lastChange = now();
    });
    try {
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    } catch {
      resolve(false);
      return;
    }

    const tick = () => {
      const n = now();
      if (n - lastChange >= idleMs) {
        obs.disconnect();
        resolve(true);
        return;
      }
      if (n - (lastChange - idleMs) >= timeoutMs) {
        obs.disconnect();
        resolve(false);
        return;
      }
      setTimeout(tick, 50);
    };
    setTimeout(tick, 50);
  });
}

function getLabelText(el: Element): string | undefined {
  // aria-labelledby
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

  // <label for="id">
  const id = el.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${cssEscape(id)}"]`) as HTMLLabelElement | null;
    const t = (label?.innerText || label?.textContent || '').replace(/\s+/g, ' ').trim();
    if (t) return t.slice(0, 120);
  }

  // wrapped by label
  const wrapLabel = el.closest('label');
  if (wrapLabel) {
    const t = ((wrapLabel as HTMLElement).innerText || wrapLabel.textContent || '').replace(/\s+/g, ' ').trim();
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
  const entry = elementStore.get(id);
  return entry?.el || null;
}

function getRect(el: Element) {
  const r = (el as HTMLElement).getBoundingClientRect?.();
  if (!r) return undefined;
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

function cssEscape(s: string) {
  // minimal escape
  return s.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

function buildSelectorHint(el: Element): string | undefined {
  // Prefer stable attributes
  const id = el.getAttribute('id');
  if (id) return `#${cssEscape(id)}`;

  const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id') || el.getAttribute('data-test');
  if (testId) return `[data-testid="${cssEscape(testId)}"]`;

  // Build a short path with nth-of-type to reduce ambiguity
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && depth < 4 && cur.tagName.toLowerCase() !== 'html') {
    const tag = cur.tagName.toLowerCase();
    const classes = Array.from(cur.classList || []).slice(0, 2).map(c => `.${cssEscape(c)}`).join('');
    const parentEl: Element | null = cur.parentElement;
    let nth = '';
    if (parentEl) {
      const siblings = Array.from(parentEl.children).filter(c => (c as Element).tagName === cur!.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(cur) + 1;
        nth = `:nth-of-type(${idx})`;
      }
    }
    parts.unshift(`${tag}${classes}${nth}`);
    cur = parentEl;
    depth++;
  }
  if (parts.length === 0) return undefined;
  return parts.join(' > ');
}

function summarizeElement(el: Element): Omit<ElementSummary, 'id'> {
  const htmlEl = el as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role') || undefined;
  const input = el as HTMLInputElement;
  const text =
    (htmlEl.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) || undefined;
  return {
    tag,
    role,
    text,
    labelText: getLabelText(el),
    name: (input as any).name || el.getAttribute('name') || undefined,
    placeholder: (input as any).placeholder || el.getAttribute('placeholder') || undefined,
    inputType: tag === 'input' ? (input.type || 'text') : undefined,
    selectorHint: buildSelectorHint(el),
    rect: getRect(el),
  };
}

function isButtonLike(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'button') return true;
  if (tag === 'a') return true;
  if (tag === 'input') {
    const t = (el as HTMLInputElement).type?.toLowerCase();
    return t === 'button' || t === 'submit' || t === 'reset';
  }
  return el.getAttribute('role') === 'button';
}

function riskAssessmentForClick(el: Element): { requires: boolean; reason?: 'submit' | 'download' | 'navigation'; message?: string } {
  const tag = el.tagName.toLowerCase();
  const text = ((el as HTMLElement).innerText || el.textContent || '').trim();
  const lowered = text.toLowerCase();

  const keywordsSubmit = ['提交', '保存', '删除', '确认', '确定', '提交审核', 'save', 'submit', 'delete', 'confirm', 'ok'];
  const keywordsDownload = ['下载', '导出', 'export', 'download'];

  // download: <a download> / blob / 常见文件后缀 / 文案包含导出下载
  if (tag === 'a') {
    const a = el as HTMLAnchorElement;
    const href = (a.getAttribute('href') || '').toLowerCase();
    if (a.hasAttribute('download') || href.startsWith('blob:') || /\.(csv|xls|xlsx|pdf|zip)(\?|#|$)/.test(href)) {
      return { requires: true, reason: 'download', message: '该操作可能触发下载/导出，是否继续？' };
    }
  }
  if (keywordsDownload.some(k => lowered.includes(k))) {
    return { requires: true, reason: 'download', message: '该操作可能触发下载/导出，是否继续？' };
  }

  // submit: button[type=submit] / input submit / form 相关 / 文案包含提交保存删除确认
  if (tag === 'button') {
    const b = el as HTMLButtonElement;
    if ((b.getAttribute('type') || '').toLowerCase() === 'submit') {
      return { requires: true, reason: 'submit', message: '该操作可能提交表单/保存变更，是否继续？' };
    }
  }
  if (tag === 'input') {
    const i = el as HTMLInputElement;
    if ((i.type || '').toLowerCase() === 'submit') {
      return { requires: true, reason: 'submit', message: '该操作可能提交表单/保存变更，是否继续？' };
    }
  }
  if (el.closest('form') && keywordsSubmit.some(k => lowered.includes(k))) {
    return { requires: true, reason: 'submit', message: '该操作可能提交表单/保存变更，是否继续？' };
  }
  if (keywordsSubmit.some(k => lowered.includes(k))) {
    return { requires: true, reason: 'submit', message: '该操作可能产生数据变更（提交/保存/删除），是否继续？' };
  }

  return { requires: false };
}

function safeFocus(el: Element) {
  try {
    (el as HTMLElement).focus?.();
  } catch {}
}

function dispatchInputEvents(el: Element) {
  try {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } catch {}
}

function clickElement(el: Element) {
  safeFocus(el);
  try {
    (el as HTMLElement).scrollIntoView?.({ block: 'center', inline: 'center' });
  } catch {}
  try {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  } catch {}
  try {
    (el as HTMLElement).click?.();
  } catch {}
}

function resolveTargetElement(args: any): Element | null {
  const byId = getStoredElement(args?.elementId);
  if (byId) return byId;
  const sel = (args?.selector as string | undefined)?.trim();
  if (sel) return document.querySelector(sel);
  return null;
}

function tool_getPageInfo(): ToolResult<{ url: string; title: string }> {
  return { ok: true, tool: 'getPageInfo', data: { url: location.href, title: document.title } };
}

function tool_getVisibleText(args: any): ToolResult<{ text: string }> {
  const limit = typeof args?.limit === 'number' ? args.limit : 8000;
  const text = extractAllVisibleText(document);
  const truncated = truncateText(text, limit);
  return { ok: true, tool: 'getVisibleText', data: { text: truncated } };
}

function tool_query(args: any): ToolResult<{ elements: ElementSummary[] }> {
  const selector = (args?.selector as string | undefined)?.trim();
  if (!selector) return { ok: false, tool: 'query', error: 'Missing selector' };
  const nodes = Array.from(document.querySelectorAll(selector)).filter(isElementVisible).slice(0, 20);
  const elements = nodes.map((el) => {
    const id = storeElement(el);
    const summary = summarizeElement(el);
    return { id, ...summary };
  });
  return { ok: true, tool: 'query', data: { elements } };
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
    const inner = ((htmlEl.innerText || el.textContent || '')).replace(/\s+/g, ' ').trim().toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
    const title = (el.getAttribute('title') || '').trim().toLowerCase();
    const placeholder = (el.getAttribute('placeholder') || '').trim().toLowerCase();
    const value = (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ? (el.value || '').trim().toLowerCase() : '';
    const name = (el.getAttribute('name') || '').trim().toLowerCase();
    const label = (getLabelText(el) || '').trim().toLowerCase();

    const hay = [inner, aria, title, placeholder, value, name, label].filter(Boolean).join(' | ');
    if (hay && hay.includes(wanted)) {
      // scoring: exact > prefix > contains; prefer shorter and interactable elements
      let score = 0;
      const fields = [inner, aria, title, placeholder, label, name, value].filter(Boolean);
      for (const f of fields) {
        if (f === wanted) score = Math.max(score, 100);
        else if (f.startsWith(wanted)) score = Math.max(score, 80);
        else if (f.includes(wanted)) score = Math.max(score, 60);
      }
      if (role === 'button' && isButtonLike(el)) score += 10;
      if ((el as any).disabled) score -= 30;
      const r = (el as HTMLElement).getBoundingClientRect?.();
      if (r) score += Math.max(0, 10 - Math.min(10, Math.floor(r.width / 200))); // prefer not-too-wide
      scored.push({ el, score });
    }
    n = walker.nextNode();
  }

  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, 20).map(s => s.el);

  const elements = results.map((el) => {
    const id = storeElement(el);
    const summary = summarizeElement(el);
    return { id, ...summary };
  });
  return { ok: true, tool: 'findByText', data: { elements } };
}

async function tool_click(args: any): Promise<ToolResult<{ clicked: boolean }>> {
  const el = resolveTargetElement(args);
  if (!el) return { ok: false, tool: 'click', error: 'Target element not found' };

  // 导航确认（新开窗口/外链跳转）
  if (el.tagName.toLowerCase() === 'a') {
    const a = el as HTMLAnchorElement;
    const target = (a.getAttribute('target') || '').toLowerCase();
    const href = (a.getAttribute('href') || '').trim();
    if (target === '_blank' || href.startsWith('http')) {
      const force = !!args?.force;
      if (!force) {
        return {
          ok: true,
          tool: 'click',
          requiresConfirmation: true,
          confirmationReason: 'navigation',
          confirmationMessage: '该操作可能打开新窗口/跳转页面，是否继续？',
          observations: makeObservations(),
          data: { clicked: false },
        };
      }
    }
  }

  const force = !!args?.force;
  const risk = riskAssessmentForClick(el);
  if (!force && risk.requires) {
    return {
      ok: true,
      tool: 'click',
      requiresConfirmation: true,
      confirmationReason: risk.reason,
      confirmationMessage: risk.message,
      observations: makeObservations(),
      data: { clicked: false },
    };
  }

  showHighlight(el, 'click');
  clickElement(el);
  await waitForDomStable();
  return { ok: true, tool: 'click', data: { clicked: true }, observations: makeObservations() };
}

async function tool_type(args: any): Promise<ToolResult<{ typed: boolean }>> {
  const el = resolveTargetElement(args);
  if (!el) return { ok: false, tool: 'type', error: 'Target element not found' };
  const text = typeof args?.text === 'string' ? args.text : '';
  const clear = args?.clear !== false; // default true

  const tag = el.tagName.toLowerCase();
  showHighlight(el, 'type');
  safeFocus(el);

  if (tag === 'input' || tag === 'textarea') {
    const input = el as HTMLInputElement | HTMLTextAreaElement;

    // 敏感输入拦截：密码/一次性验证码等不允许自动输入（除非 force）
    const inputType = (tag === 'input' ? (input as HTMLInputElement).type?.toLowerCase() : '');
    const autocomplete = (input as any).autocomplete?.toLowerCase?.() || '';
    const name = ((input as any).name || input.getAttribute('name') || '').toLowerCase();
    const placeholder = ((input as any).placeholder || input.getAttribute('placeholder') || '').toLowerCase();
    const looksSensitive =
      inputType === 'password' ||
      autocomplete.includes('one-time-code') ||
      autocomplete.includes('current-password') ||
      autocomplete.includes('new-password') ||
      name.includes('password') ||
      name.includes('otp') ||
      name.includes('verify') ||
      placeholder.includes('密码') ||
      placeholder.includes('验证码') ||
      placeholder.includes('otp');

    if (looksSensitive && !args?.force) {
      return {
        ok: true,
        tool: 'type',
        requiresConfirmation: true,
        confirmationReason: 'sensitive_input',
        confirmationMessage: '检测到疑似敏感输入框（密码/验证码等），不建议自动输入。是否仍要继续？',
        observations: makeObservations(),
        data: { typed: false },
      };
    }

    if (clear) input.value = '';
    input.value = clear ? text : input.value + text;
    dispatchInputEvents(el);
    await waitForDomStable();
    return { ok: true, tool: 'type', data: { typed: true }, observations: makeObservations() };
  }

  const htmlEl = el as HTMLElement;
  if (htmlEl.isContentEditable) {
    if (clear) htmlEl.innerText = '';
    htmlEl.innerText = clear ? text : (htmlEl.innerText || '') + text;
    dispatchInputEvents(el);
    await waitForDomStable();
    return { ok: true, tool: 'type', data: { typed: true }, observations: makeObservations() };
  }

  return { ok: false, tool: 'type', error: 'Target element is not editable' };
}

function tool_scroll(args: any): ToolResult<{ scrolled: boolean }> {
  if (typeof args?.amount === 'number') {
    window.scrollBy({ top: args.amount, left: 0, behavior: 'instant' as ScrollBehavior });
    return { ok: true, tool: 'scroll', data: { scrolled: true }, observations: makeObservations() };
  }
  const el = resolveTargetElement(args);
  if (!el) return { ok: false, tool: 'scroll', error: 'Missing amount or target element' };
  try {
    (el as HTMLElement).scrollIntoView?.({ block: 'center', inline: 'center' });
  } catch {}
  return { ok: true, tool: 'scroll', data: { scrolled: true }, observations: makeObservations() };
}

function tool_waitFor(args: any): Promise<ToolResult<{ found: boolean }>> {
  const selector = (args?.selector as string | undefined)?.trim();
  const state = (args?.state as WaitForState | undefined) || 'attached';
  const timeout = typeof args?.timeout === 'number' ? args.timeout : 5000;
  if (!selector) return Promise.resolve({ ok: false, tool: 'waitFor', error: 'Missing selector' });

  const check = () => !!document.querySelector(selector);
  const isSatisfied = () => (state === 'attached' ? check() : !check());

  if (isSatisfied()) {
    return Promise.resolve({ ok: true, tool: 'waitFor', data: { found: state === 'attached' } });
  }

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (isSatisfied()) {
        observer.disconnect();
        resolve({ ok: true, tool: 'waitFor', data: { found: state === 'attached' } });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve({ ok: true, tool: 'waitFor', data: { found: false }, error: 'timeout' });
    }, timeout);
  });
}

export async function executeTool(call: ToolCall): Promise<ToolResult> {
  const tool = call.tool as ToolName;
  const args = call.args || {};

  try {
    switch (tool) {
      case 'getPageInfo':
        return tool_getPageInfo();
      case 'getVisibleText':
        return tool_getVisibleText(args);
      case 'query':
        return tool_query(args);
      case 'findByText':
        return tool_findByText(args);
      case 'click':
        return await tool_click(args);
      case 'type':
        return await tool_type(args);
      case 'scroll':
        return tool_scroll(args);
      case 'waitFor':
        return await tool_waitFor(args);
      default:
        return { ok: false, tool: tool as ToolName, error: `Unknown tool: ${String(tool)}` };
    }
  } catch (e) {
    return { ok: false, tool: tool as ToolName, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}


