/**
 * Content Script 自动化工具执行器
 * 提供页面读取 + 低风险表单操作能力。
 */

import type {
  ElementSummary,
  InspectElementData,
  InteractAction,
  InteractResultData,
  ScreenshotOwnerIframeInfo,
  SelectedScreenshotTarget,
  ScreenshotResultData,
  SelectorType,
  ScreenshotTargetMode,
  SelectOptionSummary,
  ToolCall,
  ToolName,
  ToolResult,
  WaitForResultData,
  WaitForState,
} from '@/shared/types';
import { extractAllVisibleText, truncateText } from '@/shared/utils/text-processor';
import { isElementVisible, resolveSelector, resolveSelectorAll } from '@/shared/utils/dom-utils';
import { dispatchSyntheticMouseClick } from '@/shared/utils/synthetic-mouse-click';
import { createMessage } from '@/shared/utils';
import { TOOL_ERRORS } from '@/shared/constants';
import { ariaInspect, ariaInteract, readAriaTree, resolveAriaRef, waitForAria } from './aria-tools';

type StoredElement = { el: Element; createdAt: number };

const elementStore = new Map<string, StoredElement>();
let elementSeq = 0;

function now() {
  return Date.now();
}

const MAX_SCREENSHOT_DIMENSION = 8192;
const MAX_SCREENSHOT_DATA_URL_LENGTH = 6_000_000;
const MIN_VISIBLE_TAB_CAPTURE_INTERVAL_MS = 500;
let lastVisibleTabCaptureAt = 0;

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

function getElementId(el: Element): string {
  for (const [id, entry] of elementStore.entries()) {
    if (entry.el === el) return id;
  }
  return storeElement(el);
}

export function getOrCreateElementId(el: Element): string {
  return getElementId(el);
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

function summarizeStoredElement(el: Element): ElementSummary {
  return {
    id: getElementId(el),
    ...summarizeElement(el),
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

function isLinkLike(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  return tag === 'a' || el.getAttribute('role') === 'link';
}

function isFieldLike(el: Element): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

function matchesRole(el: Element, role?: string) {
  if (!role) return true;
  if (role === 'button') return isButtonLike(el);
  if (role === 'link') return isLinkLike(el);
  if (role === 'field') return isFieldLike(el);
  return true;
}

function resolveTargetElement(args: any, signal?: AbortSignal): Element | null {
  if (args?.elementId) {
    const byId = getStoredElement(args.elementId);
    if (byId) return byId;
  }

  const selector = (args?.selector as string | undefined)?.trim();
  if (selector) {
    const selectorType = (args?.selectorType as SelectorType | undefined) || 'css';
    return resolveSelector(selector, selectorType);
  }

  const targetText = (args?.targetText as string | undefined)?.trim();
  if (!targetText) return null;

  const targetRole = (args?.targetRole as string | undefined)?.toLowerCase();
  return resolveTargetByText(targetText, targetRole, signal);
}

function getNearbyText(el: Element): string | undefined {
  const container = el.closest('label, fieldset, form, div, section, td, li') || el.parentElement;
  if (!container) return undefined;
  const text = ((container as HTMLElement).innerText || container.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? truncateText(text, 200) : undefined;
}

function getSearchFields(el: Element) {
  const htmlEl = el as HTMLElement;
  const inner = (htmlEl.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
  const title = (el.getAttribute('title') || '').trim().toLowerCase();
  const placeholder = (el.getAttribute('placeholder') || '').trim().toLowerCase();
  const value =
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
      ? (el.value || '').trim().toLowerCase()
      : '';
  const name = (el.getAttribute('name') || '').trim().toLowerCase();
  const label = (getLabelText(el) || '').trim().toLowerCase();
  const nearby = (getNearbyText(el) || '').trim().toLowerCase();

  return { inner, aria, title, placeholder, value, name, label, nearby };
}

function scoreFieldMatch(field: string, wanted: string, exact = 100, starts = 85, contains = 65) {
  if (!field) return 0;
  if (field === wanted) return exact;
  if (field.startsWith(wanted)) return starts;
  if (field.includes(wanted)) return contains;
  return 0;
}

function findScoredElementsByText(searchText: string, role?: string, signal?: AbortSignal) {
  const wanted = searchText.toLowerCase();
  const scored: Array<{ el: Element; score: number }> = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);

  let n: Node | null = walker.nextNode();
  while (n) {
    assertNotAborted(signal);
    const el = n as Element;
    if (!isElementVisible(el) || !matchesRole(el, role)) {
      n = walker.nextNode();
      continue;
    }

    const { inner, aria, title, placeholder, value, name, label, nearby } = getSearchFields(el);
    const fields = [inner, aria, title, placeholder, label, name, value, nearby].filter(Boolean);
    const hay = fields.join(' | ');
    if (hay.includes(wanted)) {
      let score = 0;
      score = Math.max(score, scoreFieldMatch(label, wanted, 120, 100, 80));
      score = Math.max(score, scoreFieldMatch(placeholder, wanted, 110, 90, 75));
      score = Math.max(score, scoreFieldMatch(aria, wanted, 105, 90, 75));
      score = Math.max(score, scoreFieldMatch(name, wanted, 90, 75, 60));
      score = Math.max(score, scoreFieldMatch(title, wanted, 85, 70, 55));
      score = Math.max(score, scoreFieldMatch(nearby, wanted, 80, 68, 52));
      score = Math.max(score, scoreFieldMatch(inner, wanted, 75, 60, 45));
      score = Math.max(score, scoreFieldMatch(value, wanted, 70, 55, 40));

      if (role === 'button' && isButtonLike(el)) score += 10;
      if (role === 'field' && isFieldLike(el)) score += 15;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        score += 5;
      }

      scored.push({ el, score });
    }

    n = walker.nextNode();
  }

  return scored.sort((a, b) => b.score - a.score);
}

function resolveTargetByText(searchText: string, role?: string, signal?: AbortSignal): Element | null {
  return findScoredElementsByText(searchText, role, signal)[0]?.el || null;
}

function getSelectOptions(el: Element): SelectOptionSummary[] | undefined {
  if (!(el instanceof HTMLSelectElement)) return undefined;
  return Array.from(el.options)
    .slice(0, 20)
    .map((option) => ({
      label: option.label,
      value: option.value,
      selected: option.selected,
    }));
}

function getElementValue(el: Element): string | undefined {
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    return el.value;
  }
  return undefined;
}

function snapshotState() {
  const observations = makeObservations();
  return {
    url: observations?.url,
    visibleTextHash: observations?.visibleTextHash,
  };
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error('操作已中断。');
  }
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('操作已中断。'));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('操作已中断。'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function getPageMetrics() {
  const docEl = document.documentElement;
  const body = document.body;
  const root = document.scrollingElement || docEl;

  return {
    pageWidth: Math.max(
      root.scrollWidth,
      docEl.scrollWidth,
      body?.scrollWidth || 0,
      docEl.clientWidth,
      window.innerWidth
    ),
    pageHeight: Math.max(
      root.scrollHeight,
      docEl.scrollHeight,
      body?.scrollHeight || 0,
      docEl.clientHeight,
      window.innerHeight
    ),
    viewportWidth: Math.max(docEl.clientWidth || 0, window.innerWidth || 0),
    viewportHeight: Math.max(docEl.clientHeight || 0, window.innerHeight || 0),
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

function buildCapturePositions(total: number, viewport: number) {
  const positions: number[] = [];
  const safeTotal = Math.max(1, Math.round(total));
  const safeViewport = Math.max(1, Math.round(viewport));

  let offset = 0;
  while (offset < safeTotal) {
    positions.push(Math.min(offset, Math.max(safeTotal - safeViewport, 0)));
    offset += safeViewport;
    if (positions.length > 1 && positions[positions.length - 1] === positions[positions.length - 2]) {
      break;
    }
  }

  return positions;
}

function buildCapturePlan(total: number, viewport: number) {
  const positions = buildCapturePositions(total, viewport);
  let coveredUntil = 0;

  return positions
    .map((captureStart) => {
      const captureEnd = Math.min(captureStart + viewport, total);
      const drawStart = Math.max(captureStart, coveredUntil);
      const drawEnd = captureEnd;
      coveredUntil = Math.max(coveredUntil, captureEnd);

      return {
        captureStart,
        drawStart,
        drawSize: Math.max(0, drawEnd - drawStart),
        cropStart: Math.max(0, drawStart - captureStart),
      };
    })
    .filter((item) => item.drawSize > 0);
}

async function waitForNextPaint(signal?: AbortSignal) {
  assertNotAborted(signal);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await sleep(120, signal);
}

async function requestVisibleTabCapture(signal?: AbortSignal) {
  assertNotAborted(signal);
  const elapsedSinceLastCapture = Date.now() - lastVisibleTabCaptureAt;
  if (elapsedSinceLastCapture < MIN_VISIBLE_TAB_CAPTURE_INTERVAL_MS) {
    await sleep(MIN_VISIBLE_TAB_CAPTURE_INTERVAL_MS - elapsedSinceLastCapture, signal);
  }

  return new Promise<{ dataUrl: string; mimeType: string }>((resolve, reject) => {
    lastVisibleTabCaptureAt = Date.now();
    chrome.runtime.sendMessage(createMessage('CAPTURE_VISIBLE_TAB', { format: 'png' }), (response) => {
      if (signal?.aborted) {
        reject(new Error('操作已中断。'));
        return;
      }

      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (response?.type === 'ERROR') {
        reject(new Error(response?.payload?.error || '后台截图服务执行失败'));
        return;
      }

      if (!response?.ok || typeof response?.dataUrl !== 'string') {
        reject(new Error(response?.error || response?.payload?.error || '截图失败'));
        return;
      }

      resolve({
        dataUrl: response.dataUrl,
        mimeType: response.mimeType || 'image/png',
      });
    });
  });
}

function loadImage(dataUrl: string, signal?: AbortSignal) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('操作已中断。'));
      return;
    }

    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('截图图像解码失败'));
    image.src = dataUrl;
  });
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function isScrollableContainer(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement) || el instanceof HTMLIFrameElement) {
    return false;
  }

  const style = window.getComputedStyle(el);
  const overflowY = style.overflowY;
  const overflowX = style.overflowX;
  const scrollableY =
    (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
    el.scrollHeight > el.clientHeight + 4;
  const scrollableX =
    (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') &&
    el.scrollWidth > el.clientWidth + 4;

  return scrollableY || scrollableX;
}

function getContainerTargetInfo(element: HTMLElement): SelectedScreenshotTarget {
  const rect = element.getBoundingClientRect();
  return {
    elementId: getElementId(element),
    tag: element.tagName.toLowerCase(),
    kind: 'container',
    selectorHint: buildSelectorHint(element),
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  };
}

function toOwnerIframeInfo(iframe: HTMLIFrameElement): ScreenshotOwnerIframeInfo {
  const info = getIframeTargetInfo(iframe);
  return {
    elementId: info.elementId,
    selectorHint: info.selectorHint,
    rect: info.rect,
    src: info.src,
    name: info.name,
    sameOrigin: info.sameOrigin,
  };
}

function getIframeTargetInfo(iframe: HTMLIFrameElement): SelectedScreenshotTarget {
  let sameOrigin = false;
  try {
    sameOrigin = Boolean(iframe.contentDocument);
  } catch {
    sameOrigin = false;
  }

  const rect = iframe.getBoundingClientRect();
  return {
    elementId: getElementId(iframe),
    tag: iframe.tagName.toLowerCase(),
    kind: 'iframe',
    selectorHint: buildSelectorHint(iframe),
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    src: iframe.getAttribute('src') || iframe.src || undefined,
    name: iframe.getAttribute('name') || undefined,
    sameOrigin,
  };
}

function getIframeContextOrError(iframe: HTMLIFrameElement) {
  try {
    const frameWindow = iframe.contentWindow;
    const frameDocument = iframe.contentDocument;
    if (!frameWindow || !frameDocument) {
      return { error: '当前 iframe 不可访问或尚未加载完成' } as const;
    }

    return {
      iframeInfo: getIframeTargetInfo(iframe),
      frameWindow,
      frameDocument,
    } as const;
  } catch {
    return { error: '当前 iframe 为跨域 iframe，无法读取内部文档' } as const;
  }
}

function getIframeMetrics(iframe: HTMLIFrameElement) {
  const context = getIframeContextOrError(iframe);
  if ('error' in context) {
    throw new Error(context.error);
  }

  const { frameDocument, frameWindow } = context;
  const docEl = frameDocument.documentElement;
  const body = frameDocument.body;
  const root = frameDocument.scrollingElement || docEl;

  return {
    iframeInfo: context.iframeInfo,
    frameWindow,
    pageWidth: Math.max(
      root.scrollWidth,
      docEl.scrollWidth,
      body?.scrollWidth || 0,
      iframe.clientWidth,
      frameWindow.innerWidth
    ),
    pageHeight: Math.max(
      root.scrollHeight,
      docEl.scrollHeight,
      body?.scrollHeight || 0,
      iframe.clientHeight,
      frameWindow.innerHeight
    ),
    viewportWidth: Math.max(iframe.clientWidth || 0, frameWindow.innerWidth || 0),
    viewportHeight: Math.max(iframe.clientHeight || 0, frameWindow.innerHeight || 0),
    scrollX: frameWindow.scrollX,
    scrollY: frameWindow.scrollY,
  };
}

function scrollIframeTo(iframe: HTMLIFrameElement, left: number, top: number) {
  const context = getIframeContextOrError(iframe);
  if ('error' in context) {
    throw new Error(context.error);
  }
  context.frameWindow.scrollTo({
    left,
    top,
    behavior: 'instant' as ScrollBehavior,
  });
}

function getContainerMetrics(element: HTMLElement) {
  return {
    targetInfo: getContainerTargetInfo(element),
    pageWidth: Math.max(element.scrollWidth, element.clientWidth),
    pageHeight: Math.max(element.scrollHeight, element.clientHeight),
    viewportWidth: Math.max(1, element.clientWidth),
    viewportHeight: Math.max(1, element.clientHeight),
    scrollX: element.scrollLeft,
    scrollY: element.scrollTop,
  };
}

function getContainerOwnerIframe(element: HTMLElement): HTMLIFrameElement | null {
  const frameElement = element.ownerDocument.defaultView?.frameElement;
  return frameElement instanceof HTMLIFrameElement ? frameElement : null;
}

function getContainerRectInTopViewport(element: HTMLElement, ownerIframe: HTMLIFrameElement) {
  const ownerRect = ownerIframe.getBoundingClientRect();
  const innerRect = element.getBoundingClientRect();

  return {
    left: ownerRect.left + innerRect.left,
    top: ownerRect.top + innerRect.top,
    width: innerRect.width,
    height: innerRect.height,
  };
}

function scrollContainerTo(element: HTMLElement, left: number, top: number) {
  element.scrollTo({
    left,
    top,
    behavior: 'instant' as ScrollBehavior,
  });
}

function drawCroppedImageToCanvas(
  sourceImage: CanvasImageSource,
  targetCanvas: HTMLCanvasElement,
  cropRect: { left: number; top: number; width: number; height: number },
  destinationRect: { left: number; top: number; width: number; height: number }
) {
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建截图画布上下文');
  }

  ctx.drawImage(
    sourceImage,
    cropRect.left,
    cropRect.top,
    cropRect.width,
    cropRect.height,
    destinationRect.left,
    destinationRect.top,
    destinationRect.width,
    destinationRect.height
  );
}

async function captureIframeFullpage(
  iframe: HTMLIFrameElement,
  mode: 'fullpage' | 'viewport',
  signal?: AbortSignal
): Promise<ToolResult<ScreenshotResultData>> {
  const iframeContext = getIframeContextOrError(iframe);
  if ('error' in iframeContext) {
    return {
      ok: false,
      tool: 'screenshotPage',
      error: iframeContext.error,
      observations: makeObservations(),
    };
  }

  const { iframeInfo } = iframeContext;
  const iframeRect = iframe.getBoundingClientRect();
  if (iframeRect.width <= 0 || iframeRect.height <= 0) {
    return {
      ok: false,
      tool: 'screenshotPage',
      error: '目标 iframe 当前不可见，无法截图',
      observations: makeObservations(),
    };
  }

  const metrics = getIframeMetrics(iframe);
  const originalScrollX = metrics.scrollX;
  const originalScrollY = metrics.scrollY;

  try {
    if (mode === 'viewport') {
      const capture = await requestVisibleTabCapture(signal);
      const image = await loadImage(capture.dataUrl, signal);
      const pageMetrics = getPageMetrics();
      const scaleX = image.naturalWidth / Math.max(1, pageMetrics.viewportWidth);
      const scaleY = image.naturalHeight / Math.max(1, pageMetrics.viewportHeight);
      const cropCanvas = createCanvas(iframeRect.width * scaleX, iframeRect.height * scaleY);
      drawCroppedImageToCanvas(
        image,
        cropCanvas,
        {
          left: Math.round(Math.max(0, iframeRect.left) * scaleX),
          top: Math.round(Math.max(0, iframeRect.top) * scaleY),
          width: Math.round(Math.min(iframeRect.width, pageMetrics.viewportWidth - Math.max(0, iframeRect.left)) * scaleX),
          height: Math.round(Math.min(iframeRect.height, pageMetrics.viewportHeight - Math.max(0, iframeRect.top)) * scaleY),
        },
        {
          left: 0,
          top: 0,
          width: cropCanvas.width,
          height: cropCanvas.height,
        }
      );

      const serialized = serializeScreenshotCanvas(cropCanvas);
      return {
        ok: true,
        tool: 'screenshotPage',
        data: {
          mode,
          targetType: 'iframe',
          mimeType: serialized.mimeType,
          dataUrl: serialized.dataUrl,
          width: serialized.canvas.width,
          height: serialized.canvas.height,
          originalWidth: cropCanvas.width,
          originalHeight: cropCanvas.height,
          scale: 1,
          tileCount: 1,
          targetInfo: iframeInfo,
        },
        observations: makeObservations(),
      };
    }

    const xPlan = buildCapturePlan(metrics.pageWidth, metrics.viewportWidth);
    const yPlan = buildCapturePlan(metrics.pageHeight, metrics.viewportHeight);
    const tileCount = xPlan.length * yPlan.length;
    if (tileCount > 80) {
      return {
        ok: false,
        tool: 'screenshotPage',
        error: `iframe 内容过大，当前需要 ${tileCount} 张分片截图，已超过上限`,
        observations: makeObservations(),
      };
    }

    scrollIframeTo(iframe, xPlan[0]?.captureStart || 0, yPlan[0]?.captureStart || 0);
    await waitForNextPaint(signal);

    const firstCapture = await requestVisibleTabCapture(signal);
    const firstImage = await loadImage(firstCapture.dataUrl, signal);
    const pageMetrics = getPageMetrics();
    const pageScaleX = firstImage.naturalWidth / Math.max(1, pageMetrics.viewportWidth);
    const pageScaleY = firstImage.naturalHeight / Math.max(1, pageMetrics.viewportHeight);
    const cropSourceWidth = Math.max(1, Math.round(iframeRect.width * pageScaleX));
    const cropSourceHeight = Math.max(1, Math.round(iframeRect.height * pageScaleY));
    const rawWidth = Math.max(1, Math.round(metrics.pageWidth * (cropSourceWidth / Math.max(1, metrics.viewportWidth))));
    const rawHeight = Math.max(1, Math.round(metrics.pageHeight * (cropSourceHeight / Math.max(1, metrics.viewportHeight))));
    const downscale = Math.min(1, MAX_SCREENSHOT_DIMENSION / rawWidth, MAX_SCREENSHOT_DIMENSION / rawHeight);
    const canvas = createCanvas(rawWidth * downscale, rawHeight * downscale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建截图画布上下文');
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let capturedTiles = 0;
    for (const row of yPlan) {
      for (const column of xPlan) {
        assertNotAborted(signal);
        scrollIframeTo(iframe, column.captureStart, row.captureStart);
        await waitForNextPaint(signal);

        const capture = capturedTiles === 0 ? firstCapture : await requestVisibleTabCapture(signal);
        const image = capturedTiles === 0 ? firstImage : await loadImage(capture.dataUrl, signal);

        const sourceX = Math.round(Math.max(0, iframeRect.left) * pageScaleX + column.cropStart * (cropSourceWidth / Math.max(1, metrics.viewportWidth)));
        const sourceY = Math.round(Math.max(0, iframeRect.top) * pageScaleY + row.cropStart * (cropSourceHeight / Math.max(1, metrics.viewportHeight)));
        const sourceWidth = Math.max(1, Math.round(column.drawSize * (cropSourceWidth / Math.max(1, metrics.viewportWidth))));
        const sourceHeight = Math.max(1, Math.round(row.drawSize * (cropSourceHeight / Math.max(1, metrics.viewportHeight))));
        const destX = Math.round(column.drawStart * (cropSourceWidth / Math.max(1, metrics.viewportWidth)) * downscale);
        const destY = Math.round(row.drawStart * (cropSourceHeight / Math.max(1, metrics.viewportHeight)) * downscale);
        const destWidth = Math.max(1, Math.round(sourceWidth * downscale));
        const destHeight = Math.max(1, Math.round(sourceHeight * downscale));

        ctx.drawImage(
          image,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          destX,
          destY,
          destWidth,
          destHeight
        );

        capturedTiles += 1;
      }
    }

    const serialized = serializeScreenshotCanvas(canvas);
    return {
      ok: true,
      tool: 'screenshotPage',
      data: {
        mode,
        targetType: 'iframe',
        mimeType: serialized.mimeType,
        dataUrl: serialized.dataUrl,
        width: serialized.canvas.width,
        height: serialized.canvas.height,
        originalWidth: rawWidth,
        originalHeight: rawHeight,
        scale: Number((serialized.canvas.width / rawWidth).toFixed(4)),
        tileCount: capturedTiles,
        targetInfo: iframeInfo,
      },
      observations: makeObservations(),
    };
  } finally {
    scrollIframeTo(iframe, originalScrollX, originalScrollY);
  }
}

async function captureContainerFullpage(
  element: HTMLElement,
  mode: 'fullpage' | 'viewport',
  signal?: AbortSignal
): Promise<ToolResult<ScreenshotResultData>> {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return {
      ok: false,
      tool: 'screenshotPage',
      error: '目标容器当前不可见，无法截图',
      observations: makeObservations(),
    };
  }

  const metrics = getContainerMetrics(element);
  const originalScrollX = metrics.scrollX;
  const originalScrollY = metrics.scrollY;
  const targetInfo = metrics.targetInfo;

  try {
    if (mode === 'viewport') {
      const capture = await requestVisibleTabCapture(signal);
      const image = await loadImage(capture.dataUrl, signal);
      const pageMetrics = getPageMetrics();
      const scaleX = image.naturalWidth / Math.max(1, pageMetrics.viewportWidth);
      const scaleY = image.naturalHeight / Math.max(1, pageMetrics.viewportHeight);
      const cropCanvas = createCanvas(rect.width * scaleX, rect.height * scaleY);

      drawCroppedImageToCanvas(
        image,
        cropCanvas,
        {
          left: Math.round(Math.max(0, rect.left) * scaleX),
          top: Math.round(Math.max(0, rect.top) * scaleY),
          width: Math.round(Math.min(rect.width, pageMetrics.viewportWidth - Math.max(0, rect.left)) * scaleX),
          height: Math.round(Math.min(rect.height, pageMetrics.viewportHeight - Math.max(0, rect.top)) * scaleY),
        },
        {
          left: 0,
          top: 0,
          width: cropCanvas.width,
          height: cropCanvas.height,
        }
      );

      const serialized = serializeScreenshotCanvas(cropCanvas);
      return {
        ok: true,
        tool: 'screenshotPage',
        data: {
          mode,
          targetType: 'container',
          mimeType: serialized.mimeType,
          dataUrl: serialized.dataUrl,
          width: serialized.canvas.width,
          height: serialized.canvas.height,
          originalWidth: cropCanvas.width,
          originalHeight: cropCanvas.height,
          scale: 1,
          tileCount: 1,
          targetInfo,
        },
        observations: makeObservations(),
      };
    }

    const xPlan = buildCapturePlan(metrics.pageWidth, metrics.viewportWidth);
    const yPlan = buildCapturePlan(metrics.pageHeight, metrics.viewportHeight);
    const tileCount = xPlan.length * yPlan.length;
    if (tileCount > 80) {
      return {
        ok: false,
        tool: 'screenshotPage',
        error: `目标容器内容过大，当前需要 ${tileCount} 张分片截图，已超过上限`,
        observations: makeObservations(),
      };
    }

    if (!isScrollableContainer(element)) {
      const viewportResult = await captureContainerFullpage(element, 'viewport', signal);
      if (viewportResult.ok && viewportResult.data) {
        viewportResult.data.warning = '当前目标不是可滚动容器，已降级为当前可见区域截图';
      }
      return viewportResult;
    }

    scrollContainerTo(element, xPlan[0]?.captureStart || 0, yPlan[0]?.captureStart || 0);
    await waitForNextPaint(signal);

    const firstCapture = await requestVisibleTabCapture(signal);
    const firstImage = await loadImage(firstCapture.dataUrl, signal);
    const pageMetrics = getPageMetrics();
    const pageScaleX = firstImage.naturalWidth / Math.max(1, pageMetrics.viewportWidth);
    const pageScaleY = firstImage.naturalHeight / Math.max(1, pageMetrics.viewportHeight);
    const cropSourceWidth = Math.max(1, Math.round(rect.width * pageScaleX));
    const cropSourceHeight = Math.max(1, Math.round(rect.height * pageScaleY));
    const rawWidth = Math.max(1, Math.round(metrics.pageWidth * (cropSourceWidth / Math.max(1, metrics.viewportWidth))));
    const rawHeight = Math.max(1, Math.round(metrics.pageHeight * (cropSourceHeight / Math.max(1, metrics.viewportHeight))));
    const downscale = Math.min(1, MAX_SCREENSHOT_DIMENSION / rawWidth, MAX_SCREENSHOT_DIMENSION / rawHeight);
    const canvas = createCanvas(rawWidth * downscale, rawHeight * downscale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建截图画布上下文');
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let capturedTiles = 0;
    for (const row of yPlan) {
      for (const column of xPlan) {
        assertNotAborted(signal);
        scrollContainerTo(element, column.captureStart, row.captureStart);
        await waitForNextPaint(signal);

        const capture = capturedTiles === 0 ? firstCapture : await requestVisibleTabCapture(signal);
        const image = capturedTiles === 0 ? firstImage : await loadImage(capture.dataUrl, signal);

        const sourceX = Math.round(Math.max(0, rect.left) * pageScaleX + column.cropStart * (cropSourceWidth / Math.max(1, metrics.viewportWidth)));
        const sourceY = Math.round(Math.max(0, rect.top) * pageScaleY + row.cropStart * (cropSourceHeight / Math.max(1, metrics.viewportHeight)));
        const sourceWidth = Math.max(1, Math.round(column.drawSize * (cropSourceWidth / Math.max(1, metrics.viewportWidth))));
        const sourceHeight = Math.max(1, Math.round(row.drawSize * (cropSourceHeight / Math.max(1, metrics.viewportHeight))));
        const destX = Math.round(column.drawStart * (cropSourceWidth / Math.max(1, metrics.viewportWidth)) * downscale);
        const destY = Math.round(row.drawStart * (cropSourceHeight / Math.max(1, metrics.viewportHeight)) * downscale);
        const destWidth = Math.max(1, Math.round(sourceWidth * downscale));
        const destHeight = Math.max(1, Math.round(sourceHeight * downscale));

        ctx.drawImage(
          image,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          destX,
          destY,
          destWidth,
          destHeight
        );

        capturedTiles += 1;
      }
    }

    const serialized = serializeScreenshotCanvas(canvas);
    return {
      ok: true,
      tool: 'screenshotPage',
      data: {
        mode,
        targetType: 'container',
        mimeType: serialized.mimeType,
        dataUrl: serialized.dataUrl,
        width: serialized.canvas.width,
        height: serialized.canvas.height,
        originalWidth: rawWidth,
        originalHeight: rawHeight,
        scale: Number((serialized.canvas.width / rawWidth).toFixed(4)),
        tileCount: capturedTiles,
        targetInfo,
      },
      observations: makeObservations(),
    };
  } finally {
    scrollContainerTo(element, originalScrollX, originalScrollY);
  }
}

async function captureContainerInsideIframeFullpage(
  element: HTMLElement,
  ownerIframe: HTMLIFrameElement,
  mode: 'fullpage' | 'viewport',
  signal?: AbortSignal
): Promise<ToolResult<ScreenshotResultData>> {
  const ownerContext = getIframeContextOrError(ownerIframe);
  if ('error' in ownerContext) {
    return {
      ok: false,
      tool: 'screenshotPage',
      error: ownerContext.error,
      observations: makeObservations(),
    };
  }

  const rect = getContainerRectInTopViewport(element, ownerIframe);
  if (rect.width <= 0 || rect.height <= 0) {
    return {
      ok: false,
      tool: 'screenshotPage',
      error: '目标容器当前不可见，无法截图',
      observations: makeObservations(),
    };
  }

  const metrics = getContainerMetrics(element);
  const originalScrollX = metrics.scrollX;
  const originalScrollY = metrics.scrollY;
  const targetInfo: SelectedScreenshotTarget = {
    ...metrics.targetInfo,
    ownerIframeElementId: getElementId(ownerIframe),
    ownerIframeInfo: toOwnerIframeInfo(ownerIframe),
  };

  try {
    if (mode === 'viewport') {
      const capture = await requestVisibleTabCapture(signal);
      const image = await loadImage(capture.dataUrl, signal);
      const pageMetrics = getPageMetrics();
      const scaleX = image.naturalWidth / Math.max(1, pageMetrics.viewportWidth);
      const scaleY = image.naturalHeight / Math.max(1, pageMetrics.viewportHeight);
      const cropCanvas = createCanvas(rect.width * scaleX, rect.height * scaleY);

      drawCroppedImageToCanvas(
        image,
        cropCanvas,
        {
          left: Math.round(Math.max(0, rect.left) * scaleX),
          top: Math.round(Math.max(0, rect.top) * scaleY),
          width: Math.round(Math.min(rect.width, pageMetrics.viewportWidth - Math.max(0, rect.left)) * scaleX),
          height: Math.round(Math.min(rect.height, pageMetrics.viewportHeight - Math.max(0, rect.top)) * scaleY),
        },
        {
          left: 0,
          top: 0,
          width: cropCanvas.width,
          height: cropCanvas.height,
        }
      );

      const serialized = serializeScreenshotCanvas(cropCanvas);
      return {
        ok: true,
        tool: 'screenshotPage',
        data: {
          mode,
          targetType: 'container',
          mimeType: serialized.mimeType,
          dataUrl: serialized.dataUrl,
          width: serialized.canvas.width,
          height: serialized.canvas.height,
          originalWidth: cropCanvas.width,
          originalHeight: cropCanvas.height,
          scale: 1,
          tileCount: 1,
          targetInfo,
        },
        observations: makeObservations(),
      };
    }

    const xPlan = buildCapturePlan(metrics.pageWidth, metrics.viewportWidth);
    const yPlan = buildCapturePlan(metrics.pageHeight, metrics.viewportHeight);
    const tileCount = xPlan.length * yPlan.length;
    if (tileCount > 80) {
      return {
        ok: false,
        tool: 'screenshotPage',
        error: `目标容器内容过大，当前需要 ${tileCount} 张分片截图，已超过上限`,
        observations: makeObservations(),
      };
    }

    if (!isScrollableContainer(element)) {
      const viewportResult = await captureContainerInsideIframeFullpage(element, ownerIframe, 'viewport', signal);
      if (viewportResult.ok && viewportResult.data) {
        viewportResult.data.warning = '当前目标不是可滚动容器，已降级为当前可见区域截图';
      }
      return viewportResult;
    }

    scrollContainerTo(element, xPlan[0]?.captureStart || 0, yPlan[0]?.captureStart || 0);
    await waitForNextPaint(signal);

    const firstCapture = await requestVisibleTabCapture(signal);
    const firstImage = await loadImage(firstCapture.dataUrl, signal);
    const pageMetrics = getPageMetrics();
    const pageScaleX = firstImage.naturalWidth / Math.max(1, pageMetrics.viewportWidth);
    const pageScaleY = firstImage.naturalHeight / Math.max(1, pageMetrics.viewportHeight);
    const cropSourceWidth = Math.max(1, Math.round(rect.width * pageScaleX));
    const cropSourceHeight = Math.max(1, Math.round(rect.height * pageScaleY));
    const rawWidth = Math.max(1, Math.round(metrics.pageWidth * (cropSourceWidth / Math.max(1, metrics.viewportWidth))));
    const rawHeight = Math.max(1, Math.round(metrics.pageHeight * (cropSourceHeight / Math.max(1, metrics.viewportHeight))));
    const downscale = Math.min(1, MAX_SCREENSHOT_DIMENSION / rawWidth, MAX_SCREENSHOT_DIMENSION / rawHeight);
    const canvas = createCanvas(rawWidth * downscale, rawHeight * downscale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建截图画布上下文');
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let capturedTiles = 0;
    for (const row of yPlan) {
      for (const column of xPlan) {
        assertNotAborted(signal);
        scrollContainerTo(element, column.captureStart, row.captureStart);
        await waitForNextPaint(signal);

        const capture = capturedTiles === 0 ? firstCapture : await requestVisibleTabCapture(signal);
        const image = capturedTiles === 0 ? firstImage : await loadImage(capture.dataUrl, signal);
        const nextRect = getContainerRectInTopViewport(element, ownerIframe);

        const sourceX = Math.round(Math.max(0, nextRect.left) * pageScaleX + column.cropStart * (cropSourceWidth / Math.max(1, metrics.viewportWidth)));
        const sourceY = Math.round(Math.max(0, nextRect.top) * pageScaleY + row.cropStart * (cropSourceHeight / Math.max(1, metrics.viewportHeight)));
        const sourceWidth = Math.max(1, Math.round(column.drawSize * (cropSourceWidth / Math.max(1, metrics.viewportWidth))));
        const sourceHeight = Math.max(1, Math.round(row.drawSize * (cropSourceHeight / Math.max(1, metrics.viewportHeight))));
        const destX = Math.round(column.drawStart * (cropSourceWidth / Math.max(1, metrics.viewportWidth)) * downscale);
        const destY = Math.round(row.drawStart * (cropSourceHeight / Math.max(1, metrics.viewportHeight)) * downscale);
        const destWidth = Math.max(1, Math.round(sourceWidth * downscale));
        const destHeight = Math.max(1, Math.round(sourceHeight * downscale));

        ctx.drawImage(
          image,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          destX,
          destY,
          destWidth,
          destHeight
        );

        capturedTiles += 1;
      }
    }

    const serialized = serializeScreenshotCanvas(canvas);
    return {
      ok: true,
      tool: 'screenshotPage',
      data: {
        mode,
        targetType: 'container',
        mimeType: serialized.mimeType,
        dataUrl: serialized.dataUrl,
        width: serialized.canvas.width,
        height: serialized.canvas.height,
        originalWidth: rawWidth,
        originalHeight: rawHeight,
        scale: Number((serialized.canvas.width / rawWidth).toFixed(4)),
        tileCount: capturedTiles,
        targetInfo,
      },
      observations: makeObservations(),
    };
  } finally {
    scrollContainerTo(element, originalScrollX, originalScrollY);
  }
}

function downscaleCanvas(source: HTMLCanvasElement, scale: number) {
  const nextScale = Math.max(0.1, Math.min(1, scale));
  const nextCanvas = createCanvas(source.width * nextScale, source.height * nextScale);
  const ctx = nextCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建截图画布上下文');
  }

  ctx.drawImage(source, 0, 0, nextCanvas.width, nextCanvas.height);
  return nextCanvas;
}

function serializeScreenshotCanvas(sourceCanvas: HTMLCanvasElement) {
  let canvas = sourceCanvas;
  let dataUrl = canvas.toDataURL('image/png');
  let mimeType = 'image/png';

  if (dataUrl.length > MAX_SCREENSHOT_DATA_URL_LENGTH) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    mimeType = 'image/jpeg';
  }

  let attempts = 0;
  while (dataUrl.length > MAX_SCREENSHOT_DATA_URL_LENGTH && attempts < 3) {
    const nextScale = Math.sqrt(MAX_SCREENSHOT_DATA_URL_LENGTH / dataUrl.length) * 0.95;
    canvas = downscaleCanvas(canvas, nextScale);
    dataUrl = canvas.toDataURL(mimeType, mimeType === 'image/jpeg' ? 0.88 : undefined);
    attempts += 1;
  }

  return { canvas, dataUrl, mimeType };
}

function resolveTargetOrError(args: any, tool: ToolName, signal?: AbortSignal): Element | ToolResult {
  const el = resolveTargetElement(args, signal);
  if (el) return el;

  let errorMsg = 'Target element not found. ';
  if (args?.elementId) {
    errorMsg += `elementId: ${args.elementId} 可能已过期，请重新用 query 或 findByText 查找`;
  } else if (args?.selector) {
    errorMsg += `选择器 "${args.selector}" 未找到元素`;
  } else if (args?.targetText) {
    errorMsg += `未找到与文本 "${args.targetText}" 匹配的目标元素`;
  } else {
    errorMsg += '请提供 elementId、selector 或 targetText';
  }
  return { ok: false, tool, error: errorMsg };
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
}

function dispatchInputEvents(el: HTMLElement) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function dispatchKeyboardSequence(el: HTMLElement, key: string) {
  const options = { key, bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent('keydown', options));
  el.dispatchEvent(new KeyboardEvent('keypress', options));
  el.dispatchEvent(new KeyboardEvent('keyup', options));
}

async function interactClick(el: Element, signal?: AbortSignal) {
  const htmlEl = el as HTMLElement;
  htmlEl.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'instant' });
  await waitForNextPaint(signal);
  htmlEl.focus?.();
  await waitForNextPaint(signal);
  dispatchSyntheticMouseClick(el);
}

function interactType(el: Element, text: string, mode: 'replace' | 'append' = 'replace') {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    throw new Error('目标元素不是可输入控件');
  }

  el.focus();
  const nextValue = mode === 'append' ? `${el.value}${text}` : text;
  setNativeValue(el, nextValue);
  dispatchInputEvents(el);
  return nextValue;
}

function interactPress(el: Element, key: string) {
  const htmlEl = el as HTMLElement;
  htmlEl.focus?.();
  dispatchKeyboardSequence(htmlEl, key);
  if (key === 'Enter' && el instanceof HTMLInputElement && el.form) {
    el.form.requestSubmit?.();
  }
}

function interactSelectOption(el: Element, args: any) {
  if (!(el instanceof HTMLSelectElement)) {
    throw new Error('目标元素不是下拉选择框');
  }

  const value = typeof args?.value === 'string' ? args.value : undefined;
  const label = typeof args?.label === 'string' ? args.label : undefined;
  const option = Array.from(el.options).find((item) =>
    value ? item.value === value : label ? item.label.trim() === label.trim() : false
  );

  if (!option) {
    throw new Error('未找到匹配的下拉选项');
  }

  el.value = option.value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { value: option.value, label: option.label };
}

function tool_getPageInfo(signal?: AbortSignal): ToolResult<{ url: string; title: string }> {
  assertNotAborted(signal);
  return {
    ok: true,
    tool: 'getPageInfo',
    data: { url: location.href, title: document.title },
    observations: makeObservations(),
  };
}

function tool_getVisibleText(signal?: AbortSignal): ToolResult<{ text: string }> {
  assertNotAborted(signal);
  return {
    ok: true,
    tool: 'getVisibleText',
    data: { text: extractAllVisibleText(document) },
    observations: makeObservations(),
  };
}

function tool_query(args: any, signal?: AbortSignal): ToolResult<{ elements: ElementSummary[] }> {
  assertNotAborted(signal);
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

function tool_findByText(args: any, signal?: AbortSignal): ToolResult<{ elements: ElementSummary[] }> {
  assertNotAborted(signal);
  const text = (args?.text as string | undefined)?.trim();
  if (!text) return { ok: false, tool: 'findByText', error: 'Missing text' };

  const role = (args?.role as string | undefined)?.toLowerCase();
  const scored = findScoredElementsByText(text, role, signal);

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
  args: any,
  signal?: AbortSignal
): ToolResult<{ value?: string; text?: string; checked?: boolean; attribute?: string }> {
  assertNotAborted(signal);
  const resolved = resolveTargetOrError(args, 'getValue', signal);
  if ('ok' in resolved) return resolved;
  const el = resolved;

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

function tool_inspectElement(args: any, signal?: AbortSignal): ToolResult<InspectElementData> {
  assertNotAborted(signal);
  const resolved = resolveTargetOrError(args, 'inspectElement', signal);
  if ('ok' in resolved) return resolved;
  const el = resolved;

  const inputEl = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const htmlEl = el as HTMLElement;

  return {
    ok: true,
    tool: 'inspectElement',
    data: {
      element: summarizeStoredElement(el),
      value: getElementValue(el),
      checked: el instanceof HTMLInputElement ? el.checked : undefined,
      disabled: 'disabled' in inputEl ? Boolean(inputEl.disabled) : undefined,
      required: 'required' in inputEl ? Boolean((inputEl as any).required) : undefined,
      readonly: el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.readOnly : undefined,
      multiple: el instanceof HTMLSelectElement ? el.multiple : undefined,
      href: el instanceof HTMLAnchorElement ? el.href : undefined,
      options: getSelectOptions(el),
      nearbyText: getNearbyText(htmlEl),
    },
    observations: makeObservations(),
  };
}

async function tool_interact(args: any, signal?: AbortSignal): Promise<ToolResult<InteractResultData>> {
  assertNotAborted(signal);
  const action = (args?.action as InteractAction | undefined) || 'click';
  const resolved = resolveTargetOrError(
    {
      ...args,
      targetRole:
        args?.targetRole ||
        (args?.targetText
          ? action === 'click'
            ? 'button'
            : action === 'type' || action === 'selectOption' || action === 'press'
              ? 'field'
              : undefined
          : undefined),
    },
    'interact',
    signal
  );
  if ('ok' in resolved) return resolved;
  const el = resolved;

  const before = snapshotState();
  const target = summarizeStoredElement(el);
  const result: InteractResultData = {
    action,
    target,
    success: true,
  };

  switch (action) {
    case 'click':
      await interactClick(el, signal);
      break;
    case 'type': {
      const text = typeof args?.text === 'string' ? args.text : '';
      if (!text) {
        return { ok: false, tool: 'interact', error: `${TOOL_ERRORS.MISSING_REQUIRED_PARAM}: text` };
      }
      const mode = args?.mode === 'append' ? 'append' : 'replace';
      result.valuePreview = truncateText(interactType(el, text, mode), 120);
      break;
    }
    case 'press': {
      const key = typeof args?.key === 'string' ? args.key : '';
      if (!key) {
        return { ok: false, tool: 'interact', error: `${TOOL_ERRORS.MISSING_REQUIRED_PARAM}: key` };
      }
      interactPress(el, key);
      result.key = key;
      break;
    }
    case 'selectOption': {
      const selected = interactSelectOption(el, args);
      result.selectedValue = selected.value;
      result.selectedLabel = selected.label;
      result.valuePreview = truncateText(selected.label || selected.value, 120);
      break;
    }
    default:
      return { ok: false, tool: 'interact', error: `Unsupported action: ${String(action)}` };
  }

  const after = snapshotState();
  result.urlChanged = before.url !== after.url;
  result.domChanged = before.visibleTextHash !== after.visibleTextHash;

  return {
    ok: true,
    tool: 'interact',
    data: result,
    observations: makeObservations(),
  };
}

async function tool_waitFor(args: any, signal?: AbortSignal): Promise<ToolResult<WaitForResultData>> {
  assertNotAborted(signal);
  const selector = typeof args?.selector === 'string' ? args.selector.trim() : '';
  const text = typeof args?.text === 'string' ? args.text.trim() : '';
  const state = (args?.state as WaitForState | undefined) || 'appear';
  const timeoutMs = Math.min(Math.max(Number(args?.timeoutMs) || 5000, 200), 15000);
  const selectorType = (args?.selectorType as SelectorType | undefined) || 'css';

  if (!selector && !text) {
    return {
      ok: false,
      tool: 'waitFor',
      error: 'waitFor requires selector or text',
    };
  }

  const startedAt = now();
  let stableSince = 0;
  let lastStableFingerprint = '';

  while (now() - startedAt < timeoutMs) {
    assertNotAborted(signal);
    let matched = false;

    if (selector) {
      try {
        matched = resolveSelectorAll(selector, selectorType).some(isElementVisible);
      } catch (error) {
        return {
          ok: false,
          tool: 'waitFor',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    } else if (text) {
      matched = document.body.innerText.toLowerCase().includes(text.toLowerCase());
    }

    if (state === 'appear' && matched) {
      return {
        ok: true,
        tool: 'waitFor',
        data: {
          matched: true,
          elapsedMs: now() - startedAt,
          condition: selector ? `selector:${selector}` : `text:${text}`,
        },
        observations: makeObservations(),
      };
    }

    if (state === 'disappear' && !matched) {
      return {
        ok: true,
        tool: 'waitFor',
        data: {
          matched: true,
          elapsedMs: now() - startedAt,
          condition: selector ? `selector:${selector}` : `text:${text}`,
        },
        observations: makeObservations(),
      };
    }

    if (state === 'stable') {
      const fingerprint = `${matched}:${makeObservations()?.visibleTextHash || ''}`;
      if (fingerprint === lastStableFingerprint) {
        if (!stableSince) stableSince = now();
        if (now() - stableSince >= 800) {
          return {
            ok: true,
            tool: 'waitFor',
            data: {
              matched: true,
              elapsedMs: now() - startedAt,
              condition: selector ? `stable-selector:${selector}` : `stable-text:${text}`,
            },
            observations: makeObservations(),
          };
        }
      } else {
        lastStableFingerprint = fingerprint;
        stableSince = now();
      }
    }

    await sleep(200, signal);
  }

  return {
    ok: false,
    tool: 'waitFor',
    error: `waitFor timeout after ${timeoutMs}ms`,
    observations: makeObservations(),
  };
}

async function tool_screenshotPage(
  args: any,
  signal?: AbortSignal
): Promise<ToolResult<ScreenshotResultData>> {
  assertNotAborted(signal);
  const mode = args?.mode === 'viewport' ? 'viewport' : 'fullpage';
  const targetMode: ScreenshotTargetMode = args?.target === 'element' ? 'element' : 'page';
  if (targetMode === 'element') {
    const targetElement = getStoredElement(args?.elementId);
    if (!targetElement) {
      return {
        ok: false,
        tool: 'screenshotPage',
        error: '未找到已选择的截图目标，请重新选择后再试',
        observations: makeObservations(),
      };
    }

    if (targetElement instanceof HTMLIFrameElement) {
      const iframeResult = await captureIframeFullpage(targetElement, mode, signal);
      if (!iframeResult.ok) {
        const iframeInfo = getIframeTargetInfo(targetElement);
        if (!iframeInfo.sameOrigin) {
          const capture = await requestVisibleTabCapture(signal);
          const image = await loadImage(capture.dataUrl, signal);
          return {
            ok: true,
            tool: 'screenshotPage',
            data: {
              mode: 'viewport',
              targetType: 'page',
              mimeType: capture.mimeType,
              dataUrl: capture.dataUrl,
              width: image.naturalWidth,
              height: image.naturalHeight,
              originalWidth: image.naturalWidth,
              originalHeight: image.naturalHeight,
              scale: 1,
              tileCount: 1,
              warning: '目标 iframe 为跨域 iframe，已降级为普通页面可见区域截图',
              targetInfo: iframeInfo,
            },
            observations: makeObservations(),
          };
        }
      }
      return iframeResult;
    }

    if (!(targetElement instanceof HTMLElement)) {
      return {
        ok: false,
        tool: 'screenshotPage',
        error: '当前选中的目标不支持截图，请重新选择可见元素',
        observations: makeObservations(),
      };
    }

    const ownerIframe = getContainerOwnerIframe(targetElement);
    if (ownerIframe) {
      return captureContainerInsideIframeFullpage(targetElement, ownerIframe, mode, signal);
    }

    return captureContainerFullpage(targetElement, mode, signal);
  }

  const initialMetrics = getPageMetrics();
  const originalScrollX = initialMetrics.scrollX;
  const originalScrollY = initialMetrics.scrollY;

  try {
    if (mode === 'viewport') {
      const capture = await requestVisibleTabCapture(signal);
      const image = await loadImage(capture.dataUrl, signal);
      return {
        ok: true,
        tool: 'screenshotPage',
        data: {
          mode,
          targetType: 'page',
          mimeType: capture.mimeType,
          dataUrl: capture.dataUrl,
          width: image.naturalWidth,
          height: image.naturalHeight,
          originalWidth: image.naturalWidth,
          originalHeight: image.naturalHeight,
          scale: 1,
          tileCount: 1,
        },
        observations: makeObservations(),
      };
    }

    const xPlan = buildCapturePlan(initialMetrics.pageWidth, initialMetrics.viewportWidth);
    const yPlan = buildCapturePlan(initialMetrics.pageHeight, initialMetrics.viewportHeight);
    const tileCount = xPlan.length * yPlan.length;

    if (tileCount > 80) {
      return {
        ok: false,
        tool: 'screenshotPage',
        error: `页面过大，当前需要 ${tileCount} 张分片截图，已超过上限`,
        observations: makeObservations(),
      };
    }

    const firstCapturePosition = { left: xPlan[0]?.captureStart || 0, top: yPlan[0]?.captureStart || 0 };
    window.scrollTo({
      left: firstCapturePosition.left,
      top: firstCapturePosition.top,
      behavior: 'instant' as ScrollBehavior,
    });
    await waitForNextPaint(signal);

    const firstCapture = await requestVisibleTabCapture(signal);
    const firstImage = await loadImage(firstCapture.dataUrl, signal);
    const rawScaleX = firstImage.naturalWidth / Math.max(1, initialMetrics.viewportWidth);
    const rawScaleY = firstImage.naturalHeight / Math.max(1, initialMetrics.viewportHeight);
    const rawWidth = Math.max(1, Math.round(initialMetrics.pageWidth * rawScaleX));
    const rawHeight = Math.max(1, Math.round(initialMetrics.pageHeight * rawScaleY));
    const downscale = Math.min(
      1,
      MAX_SCREENSHOT_DIMENSION / rawWidth,
      MAX_SCREENSHOT_DIMENSION / rawHeight
    );

    const canvas = createCanvas(rawWidth * downscale, rawHeight * downscale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建截图画布上下文');
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let capturedTiles = 0;

    for (const row of yPlan) {
      for (const column of xPlan) {
        assertNotAborted(signal);
        window.scrollTo({
          left: column.captureStart,
          top: row.captureStart,
          behavior: 'instant' as ScrollBehavior,
        });
        await waitForNextPaint(signal);

        const capture = capturedTiles === 0 ? firstCapture : await requestVisibleTabCapture(signal);
        const image = capturedTiles === 0 ? firstImage : await loadImage(capture.dataUrl, signal);

        const sourceX = Math.round(column.cropStart * rawScaleX);
        const sourceY = Math.round(row.cropStart * rawScaleY);
        const sourceWidth = Math.max(1, Math.round(column.drawSize * rawScaleX));
        const sourceHeight = Math.max(1, Math.round(row.drawSize * rawScaleY));
        const destX = Math.round(column.drawStart * rawScaleX * downscale);
        const destY = Math.round(row.drawStart * rawScaleY * downscale);
        const destWidth = Math.max(1, Math.round(sourceWidth * downscale));
        const destHeight = Math.max(1, Math.round(sourceHeight * downscale));

        ctx.drawImage(
          image,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          destX,
          destY,
          destWidth,
          destHeight
        );

        capturedTiles += 1;
      }
    }

    const serialized = serializeScreenshotCanvas(canvas);

    return {
      ok: true,
      tool: 'screenshotPage',
      data: {
        mode,
        targetType: 'page',
        mimeType: serialized.mimeType,
        dataUrl: serialized.dataUrl,
        width: serialized.canvas.width,
        height: serialized.canvas.height,
        originalWidth: rawWidth,
        originalHeight: rawHeight,
        scale: Number((serialized.canvas.width / rawWidth).toFixed(4)),
        tileCount: capturedTiles,
      },
      observations: makeObservations(),
    };
  } finally {
    window.scrollTo({
      left: originalScrollX,
      top: originalScrollY,
      behavior: 'instant' as ScrollBehavior,
    });
  }
}

export async function executeTool(call: ToolCall, signal?: AbortSignal): Promise<ToolResult> {
  const tool = call.tool as ToolName;
  const args = call.args || {};

  try {
    switch (tool) {
      case 'getPageInfo':
        return tool_getPageInfo(signal);
      case 'getVisibleText':
        return tool_getVisibleText(signal);
      case 'readAriaTree':
        return readAriaTree(args);
      case 'resolveAriaRef':
        return resolveAriaRef(String(args.ref || ''));
      case 'ariaInspect':
        return ariaInspect(String(args.ref || ''));
      case 'ariaInteract':
        return await ariaInteract(args, signal);
      case 'waitForAria':
        return await waitForAria(args, signal);
      case 'query':
        return tool_query(args, signal);
      case 'findByText':
        return tool_findByText(args, signal);
      case 'getValue':
        return tool_getValue(args, signal);
      case 'inspectElement':
        return tool_inspectElement(args, signal);
      case 'interact':
        return await tool_interact(args, signal);
      case 'waitFor':
        return await tool_waitFor(args, signal);
      case 'screenshotPage':
        return await tool_screenshotPage(args, signal);
      default:
        return {
          ok: false,
          tool,
          error: `Tool "${String(tool)}" is not available in automation mode.`,
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


