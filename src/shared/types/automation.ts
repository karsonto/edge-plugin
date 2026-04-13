export type ToolName =
  | 'getPageInfo'
  | 'getVisibleText'
  | 'readAriaTree'
  | 'resolveAriaRef'
  | 'ariaInspect'
  | 'ariaInteract'
  | 'waitForAria'
  | 'query'
  | 'findByText'
  | 'getValue'
  | 'inspectElement'
  | 'interact'
  | 'waitFor'
  | 'screenshotPage';

export type SelectorType = 'css' | 'xpath';

export type InteractAction = 'click' | 'type' | 'press' | 'selectOption';
export type AriaTreeFilter = 'all' | 'interactive';
export type AriaCheckedState = boolean | 'mixed';
export type AriaPressedState = boolean | 'mixed';

export type WaitForState = 'appear' | 'disappear' | 'stable';

export type ScreenshotMode = 'viewport' | 'fullpage';
export type ScreenshotTargetType = 'page' | 'iframe' | 'container';
export type ScreenshotTargetMode = 'page' | 'element';

export interface ToolCall {
  tool: ToolName;
  args?: Record<string, any>;
}

export interface ToolResult<T = any> {
  ok: boolean;
  tool: ToolName;
  data?: T;
  error?: string;
  observations?: {
    url?: string;
    title?: string;
    visibleTextHash?: string;
  };
}

export interface ElementSummary {
  id: string;
  tag: string;
  text?: string;
  role?: string;
  labelText?: string;
  name?: string;
  placeholder?: string;
  inputType?: string;
  selectorHint?: string;
  rect?: { x: number; y: number; width: number; height: number };
}

export interface AriaNodeState {
  checked?: AriaCheckedState;
  disabled?: boolean;
  expanded?: boolean;
  level?: number;
  pressed?: AriaPressedState;
  selected?: boolean;
  readonly?: boolean;
  required?: boolean;
}

export interface AriaNodeProps {
  placeholder?: string;
  url?: string;
  value?: string;
  multiline?: boolean;
}

export interface AriaNodeSummary {
  ref: string;
  role: string;
  name?: string;
  tag?: string;
  description?: string;
  elementId?: string;
  selectorHint?: string;
  text?: string;
  path?: string;
  states?: AriaNodeState;
  props?: AriaNodeProps;
  rect?: { x: number; y: number; width: number; height: number };
  frameRef?: string;
  sameOriginFrame?: boolean;
}

export interface AriaFrameSummary {
  ref: string;
  role: 'iframe';
  elementId?: string;
  name?: string;
  src?: string;
  sameOrigin: boolean;
  title?: string;
  url?: string;
}

export interface AriaTreeResultData {
  tree: string;
  filter: AriaTreeFilter;
  nodeCount: number;
  refCount: number;
  sparse: boolean;
  fallbackSuggested: boolean;
  depth?: number;
  rootRef?: string;
  activeRef?: string;
  focusedRef?: string;
  frames: AriaFrameSummary[];
  warnings?: string[];
}

export interface ResolveAriaRefData {
  ref: string;
  found: boolean;
  node?: AriaNodeSummary;
  reason?: string;
}

export interface AriaInspectResultData {
  node: AriaNodeSummary;
  nearbyText?: string;
  availableActions?: InteractAction[];
}

export interface AriaInteractResultData {
  action: InteractAction;
  ref: string;
  target: AriaNodeSummary;
  success: boolean;
  valuePreview?: string;
  selectedValue?: string;
  selectedLabel?: string;
  key?: string;
  urlChanged?: boolean;
  domChanged?: boolean;
  treeChanged?: boolean;
  reloadSuggested?: boolean;
}

export interface WaitForAriaResultData {
  matched: boolean;
  elapsedMs: number;
  condition: string;
  matchedRef?: string;
}

export interface SelectOptionSummary {
  label: string;
  value: string;
  selected: boolean;
}

export interface InspectElementData {
  element: ElementSummary;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  required?: boolean;
  readonly?: boolean;
  multiple?: boolean;
  href?: string;
  options?: SelectOptionSummary[];
  nearbyText?: string;
}

export interface InteractResultData {
  action: InteractAction;
  target: ElementSummary;
  success: boolean;
  valuePreview?: string;
  selectedValue?: string;
  selectedLabel?: string;
  key?: string;
  urlChanged?: boolean;
  domChanged?: boolean;
}

export interface WaitForResultData {
  matched: boolean;
  elapsedMs: number;
  condition: string;
}

export interface ScreenshotResultData {
  mode: ScreenshotMode;
  targetType: ScreenshotTargetType;
  mimeType: string;
  dataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  scale: number;
  tileCount: number;
  warning?: string;
  targetInfo?: SelectedScreenshotTarget;
}

export interface ScreenshotOwnerIframeInfo {
  elementId: string;
  selectorHint?: string;
  rect?: { x: number; y: number; width: number; height: number };
  src?: string;
  name?: string;
  sameOrigin?: boolean;
}

export interface SelectedScreenshotTarget {
  elementId: string;
  tag: string;
  kind: 'iframe' | 'container';
  selectorHint?: string;
  rect?: { x: number; y: number; width: number; height: number };
  src?: string;
  name?: string;
  sameOrigin?: boolean;
  ownerIframeElementId?: string;
  ownerIframeInfo?: ScreenshotOwnerIframeInfo;
}


