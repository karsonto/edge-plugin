import type {
  AriaCheckedState,
  AriaFrameSummary,
  FindAriaNodesResultData,
  AriaInspectResultData,
  AriaInteractResultData,
  AriaNodeProps,
  AriaNodeState,
  AriaNodeSummary,
  AriaPressedState,
  AriaTreeResultData,
  InteractAction,
  ResolveAriaRefData,
  ToolResult,
  WaitForAriaResultData,
  WaitForState,
} from '@/shared/types';
import { truncateText } from '@/shared/utils/text-processor';
import { dispatchSyntheticMouseClick } from '@/shared/utils/synthetic-mouse-click';

type AriaStoreEntry = {
  element: Element;
  createdAt: number;
  path: string;
  frameRef?: string;
};

type AriaRenderNode = {
  summary: AriaNodeSummary;
  children: AriaRenderNode[];
};

type ReadAriaTreeArgs = {
  depth?: number;
  ref?: string;
};

type AriaQuery = {
  ref?: string;
  name?: string;
  role?: string;
  text?: string;
  scopeRef?: string;
  limit?: number;
  interactiveOnly?: boolean;
  intent?: 'click' | 'type' | 'select';
};

const REF_MAX_AGE_MS = 10 * 60 * 1000;
const ariaElementToRef = new WeakMap<Element, string>();
const ariaRefStore = new Map<string, AriaStoreEntry>();
let ariaRefSeq = 0;

function now() {
  return Date.now();
}

function pruneAriaRefs() {
  const cutoff = now() - REF_MAX_AGE_MS;
  for (const [ref, entry] of ariaRefStore.entries()) {
    if (entry.createdAt < cutoff || !entry.element.isConnected) {
      ariaRefStore.delete(ref);
    }
  }
}

function getOrCreateAriaRef(element: Element, path: string, frameRef?: string): string {
  pruneAriaRefs();
  const existing = ariaElementToRef.get(element);
  if (existing) {
    ariaRefStore.set(existing, { element, createdAt: now(), path, frameRef });
    return existing;
  }
  const ref = `aria_${(++ariaRefSeq).toString(36)}`;
  ariaElementToRef.set(element, ref);
  ariaRefStore.set(ref, { element, createdAt: now(), path, frameRef });
  return ref;
}

function normalizeAriaRef(ref?: string): string | null {
  if (typeof ref !== 'string') {
    return null;
  }
  const trimmed = ref.trim();
  if (!trimmed) {
    return null;
  }
  const bracketMatch = trimmed.match(/^\[ref=(aria_[a-z0-9]+)\]$/i);
  if (bracketMatch) {
    return bracketMatch[1];
  }
  const prefixedMatch = trimmed.match(/^ref=(aria_[a-z0-9]+)$/i);
  if (prefixedMatch) {
    return prefixedMatch[1];
  }
  if (/^aria_[a-z0-9]+$/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function getStoredAriaElement(ref?: string): Element | null {
  const normalizedRef = normalizeAriaRef(ref);
  if (!normalizedRef) {
    return null;
  }
  const entry = ariaRefStore.get(normalizedRef);
  if (!entry?.element?.isConnected) {
    ariaRefStore.delete(normalizedRef);
    return null;
  }
  entry.createdAt = now();
  return entry.element;
}

function normalizeSpace(value: string | null | undefined) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function isActuallyVisible(element: Element): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * 自定义下拉等场景下，原生 select/textarea 常被设为 0×0 但仍与 label/aria 关联且可聚焦。
 * 若一律用 bounding rect 过滤，会整颗丢失这些控件。
 */
function isObscuredButMeaningfulFormControl(element: Element): boolean {
  if (!(element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) {
    return false;
  }
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
    return false;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return false;
  }
  const html = element as HTMLElement;
  if (html.tabIndex >= 0) {
    return true;
  }
  if (normalizeSpace(element.getAttribute('aria-label'))) {
    return true;
  }
  if (resolveAriaLabelledBy(element)) {
    return true;
  }
  const id = element.getAttribute('id');
  if (id && element.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`)) {
    return true;
  }
  if (element.closest('label')) {
    return true;
  }
  return false;
}

function isIncludedInAriaTree(element: Element): boolean {
  return isActuallyVisible(element) || isObscuredButMeaningfulFormControl(element);
}

function buildSelectorHint(element: Element): string | undefined {
  const id = element.getAttribute('id');
  if (id) {
    return `#${CSS.escape(id)}`;
  }
  const testId = element.getAttribute('data-testid') || element.getAttribute('data-test-id') || element.getAttribute('data-test');
  if (testId) {
    return `[data-testid="${CSS.escape(testId)}"]`;
  }
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute('role');
  return role ? `${tag}[role="${role}"]` : tag;
}

function getElementRect(element: Element) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function resolveAriaLabelledBy(element: Element): string | undefined {
  const raw = normalizeSpace(element.getAttribute('aria-labelledby'));
  if (!raw) {
    return undefined;
  }
  const ids = raw.split(/\s+/).filter(Boolean);
  const ownerDocument = element.ownerDocument;
  const text = ids
    .map((id) => normalizeSpace(ownerDocument.getElementById(id)?.textContent))
    .filter(Boolean)
    .join(' ');
  return text || undefined;
}

function getLabelText(element: Element): string | undefined {
  const ariaLabel = normalizeSpace(element.getAttribute('aria-label'));
  if (ariaLabel) {
    return ariaLabel;
  }
  const labelledBy = resolveAriaLabelledBy(element);
  if (labelledBy) {
    return labelledBy;
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    const id = element.getAttribute('id');
    if (id) {
      const label = element.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
      const labelText = normalizeSpace(label?.textContent);
      if (labelText) {
        return labelText;
      }
    }
    const wrappingLabel = element.closest('label');
    const wrappingLabelText = normalizeSpace(wrappingLabel?.textContent);
    if (wrappingLabelText) {
      return wrappingLabelText;
    }
  }
  if (element instanceof HTMLImageElement) {
    const alt = normalizeSpace(element.alt);
    if (alt) {
      return alt;
    }
  }
  const title = normalizeSpace(element.getAttribute('title'));
  if (title) {
    return title;
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const placeholder = normalizeSpace(element.placeholder);
    if (placeholder) {
      return placeholder;
    }
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    const nameAttr = normalizeSpace(element.getAttribute('name'));
    if (nameAttr) {
      return nameAttr;
    }
  }
  const innerText = normalizeSpace((element as HTMLElement).innerText || element.textContent);
  return innerText || undefined;
}

function inferRole(element: Element): string | undefined {
  const explicitRole = normalizeSpace(element.getAttribute('role'));
  if (explicitRole && explicitRole !== 'presentation' && explicitRole !== 'none') {
    return explicitRole;
  }
  if (element instanceof HTMLButtonElement) return 'button';
  if (element instanceof HTMLAnchorElement && element.href) return 'link';
  if (element instanceof HTMLTextAreaElement) return 'textbox';
  if (element instanceof HTMLSelectElement) {
    return element.multiple ? 'listbox' : 'combobox';
  }
  if (element instanceof HTMLInputElement) {
    const type = (element.type || 'text').toLowerCase();
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (['button', 'submit', 'reset'].includes(type)) return 'button';
    if (['email', 'password', 'search', 'tel', 'text', 'url', 'number'].includes(type)) return 'textbox';
  }
  const tag = element.tagName.toLowerCase();
  if (tag === 'img') return 'img';
  if (tag === 'summary') return 'button';
  if (tag === 'dialog') return 'dialog';
  if (tag === 'main') return 'main';
  if (tag === 'nav') return 'navigation';
  if (tag === 'aside') return 'complementary';
  if (tag === 'header') return 'banner';
  if (tag === 'footer') return 'contentinfo';
  if (tag === 'section') return 'region';
  if (tag === 'form') return 'form';
  if (tag === 'ul' || tag === 'ol') return 'list';
  if (tag === 'li') return 'listitem';
  if (/^h[1-6]$/.test(tag)) return 'heading';
  return undefined;
}

function inferLevel(element: Element): number | undefined {
  const ariaLevel = Number(element.getAttribute('aria-level'));
  if (Number.isFinite(ariaLevel) && ariaLevel > 0) {
    return ariaLevel;
  }
  const tag = element.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) {
    return Number(tag.slice(1));
  }
  return undefined;
}

function getAriaPressed(element: Element): AriaPressedState | undefined {
  const raw = normalizeSpace(element.getAttribute('aria-pressed'));
  if (!raw) {
    return undefined;
  }
  if (raw === 'mixed') return 'mixed';
  return raw === 'true';
}

function getAriaChecked(element: Element): AriaCheckedState | undefined {
  if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
    return element.indeterminate ? 'mixed' : element.checked;
  }
  const raw = normalizeSpace(element.getAttribute('aria-checked'));
  if (!raw) {
    return undefined;
  }
  if (raw === 'mixed') return 'mixed';
  return raw === 'true';
}

function getNodeStates(element: Element, role: string | undefined): AriaNodeState {
  const states: AriaNodeState = {};
  const checked = getAriaChecked(element);
  if (checked !== undefined) states.checked = checked;
  const disabled = element instanceof HTMLButtonElement ||
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
      ? Boolean(element.disabled)
      : element.getAttribute('aria-disabled') === 'true';
  if (disabled) states.disabled = true;
  const expandedAttr = element.getAttribute('aria-expanded');
  if (expandedAttr === 'true') states.expanded = true;
  if (expandedAttr === 'false') states.expanded = false;
  const selectedAttr = element.getAttribute('aria-selected');
  if (selectedAttr === 'true') states.selected = true;
  if (selectedAttr === 'false') states.selected = false;
  const pressed = getAriaPressed(element);
  if (pressed !== undefined) states.pressed = pressed;
  const level = inferLevel(element);
  if (level !== undefined) states.level = level;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.readOnly) states.readonly = true;
    if (element.required) states.required = true;
  }
  if (role === 'textbox' && element.getAttribute('aria-multiline') === 'true') {
    states.readonly = states.readonly || false;
  }
  return states;
}

function getNodeProps(element: Element, role: string | undefined): AriaNodeProps {
  const props: AriaNodeProps = {};
  if (role === 'link' && element instanceof HTMLAnchorElement) {
    props.url = element.href || undefined;
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    props.value = truncateText(element.value, 200);
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.placeholder) {
      props.placeholder = element.placeholder;
    }
  }
  if (role === 'textbox' && element.getAttribute('aria-multiline') === 'true') {
    props.multiline = true;
  }
  return props;
}

function textContribution(element: Element): string | undefined {
  const text = normalizeSpace((element as HTMLElement).innerText || element.textContent);
  return text ? truncateText(text, 200) : undefined;
}

function isInteractiveRole(role?: string) {
  return Boolean(role && ['button', 'link', 'checkbox', 'radio', 'textbox', 'combobox', 'listbox', 'option', 'switch', 'tab', 'menuitem'].includes(role));
}

function isElementInteractive(element: Element, role?: string) {
  if (isInteractiveRole(role)) return true;
  if (element instanceof HTMLButtonElement || element instanceof HTMLAnchorElement) return true;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
  if (element instanceof HTMLElement && element.isContentEditable) return true;
  return element.hasAttribute('tabindex') || typeof (element as HTMLElement).onclick === 'function';
}

function shouldIncludeNode(element: Element, role: string | undefined) {
  if (!isIncludedInAriaTree(element)) {
    return false;
  }
  return Boolean(role || textContribution(element));
}

function formatStates(summary: AriaNodeSummary): string {
  const parts: string[] = [];
  const states = summary.states;
  if (!states) return '';
  if (states.checked === true) parts.push('[checked]');
  if (states.checked === 'mixed') parts.push('[checked=mixed]');
  if (states.disabled) parts.push('[disabled]');
  if (states.expanded === true) parts.push('[expanded]');
  if (states.selected === true) parts.push('[selected]');
  if (states.pressed === true) parts.push('[pressed]');
  if (states.pressed === 'mixed') parts.push('[pressed=mixed]');
  if (states.level) parts.push(`[level=${states.level}]`);
  return parts.length ? ` ${parts.join(' ')}` : '';
}

function formatNodeLine(summary: AriaNodeSummary): string {
  const tag = summary.tag || '';
  const tagHint = tag === 'textarea' || tag === 'select' || tag === 'input' ? ` <${tag}>` : '';
  const parts = [`- ${summary.role}${tagHint}`];
  if (summary.name) {
    parts.push(`"${summary.name.replace(/"/g, '\\"')}"`);
  }
  if (summary.ref) {
    parts.push(`[ref=${summary.ref}]`);
  }
  const stateSuffix = formatStates(summary);
  const line = `${parts.join(' ')}${stateSuffix}`;
  if (summary.props?.url) {
    return `${line} -> ${summary.props.url}`;
  }
  return line;
}

function renderTree(nodes: AriaRenderNode[], depth = 0, lines: string[] = []) {
  for (const node of nodes) {
    lines.push(`${'  '.repeat(depth)}${formatNodeLine(node.summary)}`);
    if (node.children.length) {
      renderTree(node.children, depth + 1, lines);
    }
  }
  return lines;
}

function buildPath(parentPath: string | undefined, role: string, index: number) {
  return parentPath ? `${parentPath}/${role}[${index}]` : `${role}[${index}]`;
}

function summarizeNode(element: Element, ref: string, path: string, frameRef?: string): AriaNodeSummary | null {
  const role = inferRole(element);
  const text = textContribution(element);
  const name = getLabelText(element);
  if (!role && !text) {
    return null;
  }
  const elementId = element.getAttribute('id') ? `#${element.getAttribute('id')}` : undefined;
  return {
    ref,
    role: role || 'text',
    name: name || undefined,
    tag: element.tagName.toLowerCase(),
    description: normalizeSpace(element.getAttribute('aria-description')) || undefined,
    elementId,
    selectorHint: buildSelectorHint(element),
    text,
    path,
    states: getNodeStates(element, role),
    props: getNodeProps(element, role),
    rect: getElementRect(element),
    frameRef,
    sameOriginFrame: frameRef ? true : undefined,
  };
}

function getTraversableChildren(element: Element): Element[] {
  const children: Element[] = Array.from(element.children);
  const shadowRoot = (element as HTMLElement).shadowRoot;
  if (shadowRoot) {
    children.push(...Array.from(shadowRoot.children));
  }
  if (element instanceof HTMLSlotElement) {
    const assigned = element.assignedElements({ flatten: true });
    children.push(...assigned);
  }
  return children;
}

function readIframeFrame(iframe: HTMLIFrameElement, ref: string): AriaFrameSummary {
  let sameOrigin = false;
  let title: string | undefined;
  let url: string | undefined;
  try {
    sameOrigin = Boolean(iframe.contentDocument);
    title = iframe.contentDocument?.title || undefined;
    url = iframe.contentWindow?.location?.href || undefined;
  } catch {
    sameOrigin = false;
  }
  return {
    ref,
    role: 'iframe',
    elementId: iframe.getAttribute('id') ? `#${iframe.getAttribute('id')}` : undefined,
    name: getLabelText(iframe) || undefined,
    src: iframe.getAttribute('src') || iframe.src || undefined,
    sameOrigin,
    title,
    url,
  };
}

function collectAriaTree(
  root: Element,
  options: { depth?: number; rootPath?: string; frameRef?: string; frames: AriaFrameSummary[] }
): AriaRenderNode[] {
  const result: AriaRenderNode[] = [];
  const childCounters = new Map<string, number>();

  const visit = (element: Element, currentDepth: number, parentPath?: string, frameRef?: string): AriaRenderNode | null => {
    if (options.depth !== undefined && currentDepth > options.depth) {
      return null;
    }
    const role = inferRole(element);
    const nextIndex = (childCounters.get(parentPath || '__root__') || 0) + 1;
    childCounters.set(parentPath || '__root__', nextIndex);
    const path = buildPath(parentPath, role || element.tagName.toLowerCase(), nextIndex);
    const ref = getOrCreateAriaRef(element, path, frameRef);
    const summary = summarizeNode(element, ref, path, frameRef);

    let children: AriaRenderNode[] = [];
    if (element instanceof HTMLIFrameElement) {
      const frameSummary = readIframeFrame(element, ref);
      options.frames.push(frameSummary);
      if (frameSummary.sameOrigin && options.depth !== undefined ? currentDepth < options.depth : true) {
        const frameRoot = element.contentDocument?.body;
        if (frameRoot) {
          children = collectAriaTree(frameRoot, {
            depth: options.depth,
            rootPath: path,
            frameRef: ref,
            frames: options.frames,
          });
        }
      }
    } else {
      children = getTraversableChildren(element)
        .map((child) => visit(child, currentDepth + 1, path, frameRef))
        .filter((child): child is AriaRenderNode => Boolean(child));
    }

    if (!summary) {
      return children.length ? { summary: {
        ref,
        role: 'group',
        path,
        selectorHint: buildSelectorHint(element),
        rect: getElementRect(element),
        frameRef,
      }, children } : null;
    }

    if (!shouldIncludeNode(element, role)) {
      return children.length ? { summary, children } : null;
    }

    if (!role && children.length > 0) {
      summary.text = undefined;
    }

    return { summary, children };
  };

  const rootChildren = getTraversableChildren(root);
  for (const child of rootChildren) {
    const node = visit(child, 1, options.rootPath, options.frameRef);
    if (node) {
      result.push(node);
    }
  }
  return result;
}

function flattenTree(nodes: AriaRenderNode[], out: AriaNodeSummary[] = []): AriaNodeSummary[] {
  for (const node of nodes) {
    out.push(node.summary);
    flattenTree(node.children, out);
  }
  return out;
}

function getAriaSearchSpace(scopeRef?: string) {
  const scopeElement = scopeRef ? getStoredAriaElement(scopeRef) : document.body;
  if (!scopeElement) {
    return { root: null, flattened: [] as AriaNodeSummary[] };
  }

  const frames: AriaFrameSummary[] = [];
  const tree = collectAriaTree(scopeElement, { rootPath: scopeRef, frames });
  return {
    root: scopeElement,
    flattened: flattenTree(tree),
  };
}

function scoreAriaNodeMatch(node: AriaNodeSummary, query: AriaQuery) {
  const wantedName = normalizeSpace(query.name).toLowerCase();
  const wantedRole = normalizeSpace(query.role).toLowerCase();
  const wantedText = normalizeSpace(query.text).toLowerCase();
  const nodeRole = normalizeSpace(node.role).toLowerCase();
  const nodeName = normalizeSpace(node.name).toLowerCase();
  const nodeText = normalizeSpace(node.text).toLowerCase();
  const nodePath = normalizeSpace(node.path).toLowerCase();

  if (wantedRole && nodeRole !== wantedRole) {
    return -1;
  }

  let score = 0;

  if (wantedName) {
    if (nodeName === wantedName) score += 120;
    else if (nodeName.startsWith(wantedName)) score += 95;
    else if (nodeName.includes(wantedName)) score += 75;
    else if (nodeText.includes(wantedName)) score += 45;
    else return -1;
  }

  if (wantedText) {
    if (nodeText === wantedText) score += 100;
    else if (nodeText.startsWith(wantedText)) score += 80;
    else if (nodeText.includes(wantedText)) score += 60;
    else if (nodeName.includes(wantedText)) score += 35;
    else if (nodePath.includes(wantedText)) score += 20;
    else return wantedName ? score : -1;
  }

  if (wantedRole) {
    score += 20;
  }

  if (!wantedName && !wantedText && wantedRole) {
    score += 10;
  }

  if (wantedRole === 'textbox' || wantedRole === 'combobox' || wantedRole === 'button') {
    if (node.name) score += 8;
    if (node.props?.placeholder) score += 6;
  }

  if (wantedRole === 'textbox' && node.props?.value) {
    score += 4;
  }

  if (wantedRole === 'button' && node.states?.disabled === false) {
    score += 4;
  }

  if (node.states?.disabled) {
    score -= 10;
  }

  if (query.interactiveOnly && !isInteractiveRole(node.role)) {
    return -1;
  }

  if (query.intent === 'click') {
    if (node.role === 'button' || node.role === 'link' || node.role === 'switch' || node.role === 'tab') {
      score += 25;
    } else if (!isInteractiveRole(node.role)) {
      return -1;
    }
  }

  if (query.intent === 'type') {
    if (node.role === 'textbox') {
      score += 25;
    } else if (node.role !== 'combobox') {
      return -1;
    }
  }

  if (query.intent === 'select') {
    if (node.role === 'combobox' || node.role === 'listbox' || node.role === 'option') {
      score += 25;
    } else if (!isInteractiveRole(node.role)) {
      return -1;
    }
  }

  return score;
}

function findAriaTargets(query: AriaQuery): AriaNodeSummary[] {
  const { flattened } = getAriaSearchSpace(query.scopeRef);

  if (query.ref) {
    return flattened.filter((node) => node.ref === query.ref);
  }

  const scored = flattened
    .map((node) => ({ node, score: scoreAriaNodeMatch(node, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);

  const limit = Math.min(Math.max(Number(query.limit) || 5, 1), 10);
  return scored.slice(0, limit).map((entry) => entry.node);
}

function findAriaTarget(query: AriaQuery): AriaNodeSummary | undefined {
  return findAriaTargets({ ...query, limit: 1 })[0];
}

function getAvailableActions(element: Element): InteractAction[] {
  const actions: InteractAction[] = [];
  if (isElementInteractive(element, inferRole(element))) {
    actions.push('click');
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    actions.push('type', 'press');
  } else if (element instanceof HTMLSelectElement) {
    actions.push('selectOption');
  } else if (element instanceof HTMLElement && element.isContentEditable) {
    actions.push('type', 'press');
  } else if (actions.length) {
    actions.push('press');
  }
  return Array.from(new Set(actions));
}

function getOwnedElements(element: Element): Element[] {
  const ownerDocument = element.ownerDocument;
  const rawIds = [
    normalizeSpace(element.getAttribute('aria-controls')),
    normalizeSpace(element.getAttribute('aria-owns')),
  ]
    .filter(Boolean)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean);

  return rawIds
    .map((id) => ownerDocument.getElementById(id))
    .filter((owned): owned is HTMLElement => Boolean(owned));
}

function isPopupContainer(element: Element) {
  const role = inferRole(element);
  return role === 'listbox' || role === 'dialog' || role === 'menu' || role === 'tree' || role === 'grid';
}

function findPopupContainer(element: Element): Element | null {
  const owned = getOwnedElements(element).find((candidate) => isPopupContainer(candidate) && isIncludedInAriaTree(candidate));
  if (owned) {
    return owned;
  }

  const ariaHasPopup = normalizeSpace(element.getAttribute('aria-haspopup'));
  if (ariaHasPopup && ariaHasPopup !== 'false') {
    const popup = Array.from(document.querySelectorAll('[role="listbox"], [role="dialog"], [role="menu"]'))
      .find((candidate) => isIncludedInAriaTree(candidate));
    if (popup) {
      return popup;
    }
  }

  return null;
}

function scorePopupOption(option: Element, wantedValue: string, wantedLabel: string) {
  const optionText = normalizeSpace((option as HTMLElement).innerText || option.textContent).toLowerCase();
  const optionLabel = normalizeSpace(option.getAttribute('aria-label')).toLowerCase();
  const haystacks = [optionText, optionLabel].filter(Boolean);
  const wanted = [wantedLabel, wantedValue].filter(Boolean);

  if (wanted.length === 0) {
    return -1;
  }

  let score = -1;
  for (const expected of wanted) {
    for (const actual of haystacks) {
      if (!actual) continue;
      if (actual === expected) score = Math.max(score, 120);
      else if (actual.startsWith(expected)) score = Math.max(score, 95);
      else if (actual.includes(expected)) score = Math.max(score, 75);
    }
  }

  return score;
}

function findPopupOption(container: Element, args: { value?: string; label?: string }) {
  const wantedValue = normalizeSpace(args.value).toLowerCase();
  const wantedLabel = normalizeSpace(args.label).toLowerCase();
  const options = Array.from(container.querySelectorAll('[role="option"], [role="menuitem"], button, li'))
    .filter((option) => isIncludedInAriaTree(option));

  const scored = options
    .map((option) => ({ option, score: scorePopupOption(option, wantedValue, wantedLabel) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.option || null;
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
}

function dispatchInputEvents(element: HTMLElement) {
  element.dispatchEvent(new Event('focus', { bubbles: true }));
  element.dispatchEvent(new Event('beforeinput', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

function dispatchKeyboardSequence(element: HTMLElement, key: string) {
  const options = { key, bubbles: true, cancelable: true };
  element.dispatchEvent(new KeyboardEvent('keydown', options));
  element.dispatchEvent(new KeyboardEvent('keypress', options));
  element.dispatchEvent(new KeyboardEvent('keyup', options));
}

function snapshotFingerprint() {
  const text = normalizeSpace(document.body.innerText).slice(0, 1000);
  return `${location.href}::${text}`;
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error('操作已中断。');
  }
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => resolve(), ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('操作已中断。'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function waitForNextPaint(signal?: AbortSignal): Promise<void> {
  assertNotAborted(signal);
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      cancelAnimationFrame(rafId);
      reject(new Error('操作已中断。'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const rafId = requestAnimationFrame(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    });
  });
}

export function readAriaTree(args: ReadAriaTreeArgs = {}): ToolResult<AriaTreeResultData> {
  const depth = Number.isInteger(args.depth) && Number(args.depth) >= 0 ? Number(args.depth) : undefined;
  const root = args.ref ? getStoredAriaElement(args.ref) : document.body;
  if (!root) {
    return {
      ok: false,
      tool: 'readAriaTree',
      error: `未找到 ref "${args.ref}" 对应的节点`,
    };
  }

  const frames: AriaFrameSummary[] = [];
  const tree = collectAriaTree(root, { depth, rootPath: args.ref, frames });
  const flattened = flattenTree(tree);
  const treeText = renderTree(tree).join('\n');
  const interactiveCount = flattened.filter((node) => isInteractiveRole(node.role)).length;
  const sparse = flattened.length < 6 || interactiveCount < 2;
  const activeElement = document.activeElement instanceof Element ? document.activeElement : null;
  const activeRef = activeElement ? getOrCreateAriaRef(activeElement, 'active') : undefined;
  const warnings = frames.some((frame) => !frame.sameOrigin) ? ['页面包含跨域 iframe，相关区域可能需要截图回退'] : [];

  return {
    ok: true,
    tool: 'readAriaTree',
    data: {
      tree: treeText,
      filter: 'all',
      nodeCount: flattened.length,
      refCount: flattened.length,
      sparse,
      fallbackSuggested: sparse || warnings.length > 0,
      depth,
      rootRef: args.ref,
      activeRef,
      focusedRef: activeRef,
      frames,
      warnings,
    },
  };
}

export function findAriaNodes(args: {
  name?: string;
  role?: string;
  text?: string;
  scopeRef?: string;
  limit?: number;
  interactiveOnly?: boolean;
  intent?: 'click' | 'type' | 'select';
} = {}): ToolResult<FindAriaNodesResultData> {
  const scopeRef = args.scopeRef ? normalizeAriaRef(args.scopeRef) || undefined : undefined;
  if (args.scopeRef && !scopeRef) {
    return {
      ok: false,
      tool: 'findAriaNodes',
      error: `scopeRef "${args.scopeRef}" 格式无效，请使用完整 ref，例如 aria_1`,
    };
  }

  if (!normalizeSpace(args.name) && !normalizeSpace(args.text) && !normalizeSpace(args.role)) {
    return {
      ok: false,
      tool: 'findAriaNodes',
      error: 'findAriaNodes 需要至少提供 name、text 或 role 之一',
    };
  }

  const candidates = findAriaTargets({
    name: args.name,
    role: args.role,
    text: args.text,
    scopeRef,
    limit: args.limit,
    interactiveOnly: Boolean(args.interactiveOnly),
    intent: args.intent,
  });

  return {
    ok: true,
    tool: 'findAriaNodes',
    data: {
      query: {
        name: normalizeSpace(args.name) || undefined,
        role: normalizeSpace(args.role) || undefined,
        text: normalizeSpace(args.text) || undefined,
        scopeRef,
        limit: Math.min(Math.max(Number(args.limit) || 5, 1), 10),
        interactiveOnly: Boolean(args.interactiveOnly),
        intent: args.intent,
      },
      candidates,
    },
  };
}

function findInteractiveAncestors(element: Element, limit = 3): AriaNodeSummary[] {
  const result: AriaNodeSummary[] = [];
  let current = element.parentElement;

  while (current && result.length < limit) {
    const role = inferRole(current);
    if (isElementInteractive(current, role)) {
      const ref = getOrCreateAriaRef(current, `ancestor_${result.length + 1}`);
      const path = ariaRefStore.get(ref)?.path || ref;
      const summary = summarizeNode(current, ref, path, ariaRefStore.get(ref)?.frameRef);
      if (summary) {
        result.push(summary);
      }
    }
    current = current.parentElement;
  }

  return result;
}

export function resolveAriaRef(ref: string): ToolResult<ResolveAriaRefData> {
  const normalizedRef = normalizeAriaRef(ref);
  if (!normalizedRef) {
    return {
      ok: false,
      tool: 'resolveAriaRef',
      error: `ref "${ref}" 格式无效，请使用完整 ref，例如 aria_1`,
      data: { ref, found: false, reason: 'invalid_format' },
    };
  }
  const element = getStoredAriaElement(normalizedRef);
  if (!element) {
    return {
      ok: false,
      tool: 'resolveAriaRef',
      error: `ref "${normalizedRef}" 已失效，请重新读取语义树`,
      data: { ref: normalizedRef, found: false, reason: 'expired_or_missing' },
    };
  }
  const path = ariaRefStore.get(normalizedRef)?.path || normalizedRef;
  const summary = summarizeNode(element, normalizedRef, path, ariaRefStore.get(normalizedRef)?.frameRef);
  return {
    ok: true,
    tool: 'resolveAriaRef',
    data: {
      ref: normalizedRef,
      found: Boolean(summary),
      node: summary || undefined,
    },
  };
}

export function ariaInspect(ref: string): ToolResult<AriaInspectResultData> {
  const normalizedRef = normalizeAriaRef(ref);
  if (!normalizedRef) {
    return {
      ok: false,
      tool: 'ariaInspect',
      error: `ref "${ref}" 格式无效，请使用完整 ref，例如 aria_1`,
    };
  }
  const element = getStoredAriaElement(normalizedRef);
  if (!element) {
    return {
      ok: false,
      tool: 'ariaInspect',
      error: `ref "${normalizedRef}" 已失效，请重新读取语义树`,
    };
  }
  const path = ariaRefStore.get(normalizedRef)?.path || normalizedRef;
  const summary = summarizeNode(element, normalizedRef, path, ariaRefStore.get(normalizedRef)?.frameRef);
  if (!summary) {
    return {
      ok: false,
      tool: 'ariaInspect',
      error: `ref "${normalizedRef}" 不是可读取的语义节点`,
    };
  }
  return {
    ok: true,
    tool: 'ariaInspect',
    data: {
      node: summary,
      nearbyText: truncateText(normalizeSpace(element.closest('label, form, section, article, main, div')?.textContent), 240) || undefined,
      availableActions: getAvailableActions(element),
      interactiveAncestor: findInteractiveAncestors(element, 1)[0],
      interactiveAncestors: findInteractiveAncestors(element, 3),
    },
  };
}

export async function ariaInteract(
  args: { ref?: string; action?: InteractAction; text?: string; key?: string; value?: string; label?: string; mode?: 'replace' | 'append' },
  signal?: AbortSignal
): Promise<ToolResult<AriaInteractResultData>> {
  const ref = normalizeAriaRef(args.ref || '');
  const action = args.action;
  if (!ref) {
    return {
      ok: false,
      tool: 'ariaInteract',
      error: `ref "${args.ref || ''}" 格式无效，请使用完整 ref，例如 aria_1`,
    };
  }
  const element = getStoredAriaElement(ref);
  if (!element) {
    return {
      ok: false,
      tool: 'ariaInteract',
      error: `ref "${ref}" 已失效，请重新读取语义树`,
    };
  }
  if (!action) {
    return {
      ok: false,
      tool: 'ariaInteract',
      error: '缺少 action',
    };
  }

  const before = snapshotFingerprint();
  const path = ariaRefStore.get(ref)?.path || ref;
  const target = summarizeNode(element, ref, path, ariaRefStore.get(ref)?.frameRef);
  if (!target) {
    return {
      ok: false,
      tool: 'ariaInteract',
      error: `ref "${ref}" 不是可交互语义节点`,
    };
  }

  const result: AriaInteractResultData = {
    action,
    ref,
    target,
    success: true,
    beforeNode: target,
  };

  try {
    const htmlElement = element as HTMLElement;
    switch (action) {
      case 'click': {
        htmlElement.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        await waitForNextPaint(signal);
        htmlElement.focus?.();
        await waitForNextPaint(signal);
        dispatchSyntheticMouseClick(element);
        break;
      }
      case 'type': {
        const text = args.text ?? '';
        if (!text) throw new Error('缺少 text');
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          element.focus();
          const nextValue = args.mode === 'append' ? `${element.value}${text}` : text;
          setNativeValue(element, nextValue);
          dispatchInputEvents(element);
          result.valuePreview = truncateText(nextValue, 120);
        } else if (htmlElement.isContentEditable) {
          htmlElement.focus();
          htmlElement.textContent = args.mode === 'append' ? `${htmlElement.textContent || ''}${text}` : text;
          dispatchInputEvents(htmlElement);
          result.valuePreview = truncateText(normalizeSpace(htmlElement.textContent), 120);
        } else {
          throw new Error('目标节点不可输入');
        }
        break;
      }
      case 'press': {
        const key = args.key ?? '';
        if (!key) throw new Error('缺少 key');
        htmlElement.focus?.();
        dispatchKeyboardSequence(htmlElement, key);
        result.key = key;
        break;
      }
      case 'selectOption': {
        if (element instanceof HTMLSelectElement) {
          const option = Array.from(element.options).find((item) => (args.value ? item.value === args.value : args.label ? item.label.trim() === args.label.trim() : false));
          if (!option) throw new Error('未找到匹配的下拉选项');
          element.value = option.value;
          dispatchInputEvents(element);
          result.selectedValue = option.value;
          result.selectedLabel = option.label;
          result.valuePreview = truncateText(option.label || option.value, 120);
          break;
        }

        const role = inferRole(element);
        if (role !== 'combobox' && role !== 'listbox') {
          throw new Error('目标节点不是可选择控件');
        }

        const popup = findPopupContainer(element);
        if (!popup) {
          throw new Error('未找到关联的选项面板，请先展开下拉后重试');
        }

        const option = findPopupOption(popup, {
          value: args.value,
          label: args.label,
        });
        if (!option) {
          throw new Error('在当前选项面板中未找到匹配项');
        }

        (option as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        await waitForNextPaint(signal);
        dispatchSyntheticMouseClick(option);
        result.selectedValue = normalizeSpace(option.getAttribute('data-value')) || undefined;
        result.selectedLabel = normalizeSpace((option as HTMLElement).innerText || option.textContent) || undefined;
        result.valuePreview = truncateText(result.selectedLabel || result.selectedValue || '', 120);
        break;
      }
    }
  } catch (error) {
    return {
      ok: false,
      tool: 'ariaInteract',
      error: error instanceof Error ? error.message : '未知错误',
    };
  }

  const after = snapshotFingerprint();
  const refreshedElement = getStoredAriaElement(ref);
  const afterPath = ariaRefStore.get(ref)?.path || ref;
  const afterNode =
    refreshedElement
      ? summarizeNode(refreshedElement, ref, afterPath, ariaRefStore.get(ref)?.frameRef) || undefined
      : undefined;
  result.urlChanged = before.split('::')[0] !== after.split('::')[0];
  result.domChanged = before !== after;
  result.treeChanged = result.domChanged;
  result.reloadSuggested = result.domChanged;
  result.afterNode = afterNode;
  result.changedFields = [];

  if (result.beforeNode?.props?.value !== afterNode?.props?.value) {
    result.changedFields.push('value');
  }
  if (result.beforeNode?.states?.expanded !== afterNode?.states?.expanded) {
    result.changedFields.push('expanded');
  }
  if (result.beforeNode?.states?.selected !== afterNode?.states?.selected) {
    result.changedFields.push('selected');
  }
  if (result.beforeNode?.states?.checked !== afterNode?.states?.checked) {
    result.changedFields.push('checked');
  }
  if (result.beforeNode?.states?.pressed !== afterNode?.states?.pressed) {
    result.changedFields.push('pressed');
  }

  if ((action === 'type' || action === 'selectOption') && afterNode?.props?.value) {
    result.valuePreview = truncateText(afterNode.props.value, 120);
  }

  return {
    ok: true,
    tool: 'ariaInteract',
    data: result,
  };
}

export async function waitForAria(
  args: { ref?: string; name?: string; role?: string; state?: WaitForState; timeoutMs?: number },
  signal?: AbortSignal
): Promise<ToolResult<WaitForAriaResultData>> {
  const state = args.state || 'appear';
  const normalizedRef = args.ref !== undefined ? normalizeAriaRef(args.ref) ?? undefined : undefined;
  if (args.ref !== undefined && !normalizedRef) {
    return {
      ok: false,
      tool: 'waitForAria',
      error: `ref "${args.ref}" 格式无效，请使用完整 ref，例如 aria_1`,
    };
  }
  const timeoutMs = Math.min(Math.max(Number(args.timeoutMs) || 8000, 200), 30000);
  const startedAt = now();
  let stableSince = 0;
  let lastFingerprint = '';
  let initialTarget = findAriaTarget({ ref: normalizedRef, name: args.name, role: args.role });
  const initialValue = initialTarget?.props?.value;
  const initialExpanded = initialTarget?.states?.expanded;
  const initialSelected = initialTarget?.states?.selected;

  while (now() - startedAt < timeoutMs) {
    assertNotAborted(signal);
    const target = findAriaTarget({ ref: normalizedRef, name: args.name, role: args.role });
    const matched = Boolean(target);

    if (state === 'appear' && matched) {
      return {
        ok: true,
        tool: 'waitForAria',
        data: {
          matched: true,
          elapsedMs: now() - startedAt,
          condition: normalizedRef ? `ref:${normalizedRef}` : `role:${args.role || '*'} name:${args.name || '*'}`,
          matchedRef: target?.ref,
        },
      };
    }
    if (state === 'disappear' && !matched) {
      return {
        ok: true,
        tool: 'waitForAria',
        data: {
          matched: true,
          elapsedMs: now() - startedAt,
          condition: normalizedRef ? `disappear:${normalizedRef}` : `disappear role:${args.role || '*'} name:${args.name || '*'}`,
        },
      };
    }
    if (state === 'stable' && matched) {
      const fingerprint = `${target?.ref}:${target?.name || ''}:${target?.text || ''}:${target?.states?.expanded ?? ''}`;
      if (fingerprint === lastFingerprint) {
        if (!stableSince) stableSince = now();
        if (now() - stableSince >= 800) {
          return {
            ok: true,
            tool: 'waitForAria',
            data: {
              matched: true,
              elapsedMs: now() - startedAt,
              condition: `stable:${target?.ref || args.ref || 'query'}`,
              matchedRef: target?.ref,
            },
          };
        }
      } else {
        lastFingerprint = fingerprint;
        stableSince = now();
      }
    }

    if (state === 'valueChanged' && matched && target?.props?.value !== initialValue) {
      return {
        ok: true,
        tool: 'waitForAria',
        data: {
          matched: true,
          elapsedMs: now() - startedAt,
          condition: `valueChanged:${target?.ref || args.ref || 'query'}`,
          matchedRef: target?.ref,
        },
      };
    }

    if (state === 'expandedChanged' && matched && target?.states?.expanded !== initialExpanded) {
      return {
        ok: true,
        tool: 'waitForAria',
        data: {
          matched: true,
          elapsedMs: now() - startedAt,
          condition: `expandedChanged:${target?.ref || args.ref || 'query'}`,
          matchedRef: target?.ref,
        },
      };
    }

    if (state === 'selectedChanged' && matched && target?.states?.selected !== initialSelected) {
      return {
        ok: true,
        tool: 'waitForAria',
        data: {
          matched: true,
          elapsedMs: now() - startedAt,
          condition: `selectedChanged:${target?.ref || args.ref || 'query'}`,
          matchedRef: target?.ref,
        },
      };
    }

    await sleep(200, signal);
  }

  return {
    ok: false,
    tool: 'waitForAria',
    error: `waitForAria timeout after ${timeoutMs}ms`,
  };
}
