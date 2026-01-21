/**
 * Content 侧高亮 Overlay：在执行 click/type 前可视化标注目标元素
 * - 不拦截鼠标事件（pointer-events:none）
 * - 由调用方控制 show/clear
 */

let overlayEl: HTMLDivElement | null = null;
let overlayLabelEl: HTMLDivElement | null = null;
let clearTimer: number | null = null;

const HIGHLIGHT_TTL_MS = 1000;

function ensureOverlay() {
  if (overlayEl && overlayLabelEl) return;

  overlayEl = document.createElement('div');
  overlayEl.style.position = 'fixed';
  overlayEl.style.zIndex = '2147483647';
  overlayEl.style.pointerEvents = 'none';
  overlayEl.style.border = '2px solid rgba(99,102,241,0.95)'; // primary-ish
  overlayEl.style.borderRadius = '6px';
  overlayEl.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)';

  overlayLabelEl = document.createElement('div');
  overlayLabelEl.style.position = 'fixed';
  overlayLabelEl.style.zIndex = '2147483647';
  overlayLabelEl.style.pointerEvents = 'none';
  overlayLabelEl.style.padding = '4px 6px';
  overlayLabelEl.style.fontSize = '12px';
  overlayLabelEl.style.fontWeight = '600';
  overlayLabelEl.style.color = '#ffffff';
  overlayLabelEl.style.background = 'rgba(99,102,241,0.95)';
  overlayLabelEl.style.borderRadius = '6px';
  overlayLabelEl.style.maxWidth = '60vw';
  overlayLabelEl.style.whiteSpace = 'nowrap';
  overlayLabelEl.style.overflow = 'hidden';
  overlayLabelEl.style.textOverflow = 'ellipsis';

  document.documentElement.appendChild(overlayEl);
  document.documentElement.appendChild(overlayLabelEl);
}

export function clearHighlight() {
  if (clearTimer != null) {
    window.clearTimeout(clearTimer);
    clearTimer = null;
  }
  overlayEl?.remove();
  overlayLabelEl?.remove();
  overlayEl = null;
  overlayLabelEl = null;
}

export function showHighlight(target: Element, label: string) {
  ensureOverlay();
  if (!overlayEl || !overlayLabelEl) return;

  const rect = (target as HTMLElement).getBoundingClientRect?.();
  if (!rect) return;

  const pad = 2;
  const top = Math.max(0, rect.top - pad);
  const left = Math.max(0, rect.left - pad);
  const width = Math.max(0, rect.width + pad * 2);
  const height = Math.max(0, rect.height + pad * 2);

  overlayEl.style.top = `${top}px`;
  overlayEl.style.left = `${left}px`;
  overlayEl.style.width = `${width}px`;
  overlayEl.style.height = `${height}px`;

  overlayLabelEl.textContent = label;
  const labelTop = Math.max(0, top - 28);
  overlayLabelEl.style.top = `${labelTop}px`;
  overlayLabelEl.style.left = `${left}px`;

  // Auto-hide after TTL (reset on every highlight call)
  if (clearTimer != null) window.clearTimeout(clearTimer);
  clearTimer = window.setTimeout(() => clearHighlight(), HIGHLIGHT_TTL_MS);
}


