export type ToolName =
  | 'getPageInfo'
  | 'getVisibleText'
  | 'query'
  | 'findByText'
  | 'getValue'
  | 'inspectElement'
  | 'interact'
  | 'waitFor'
  | 'screenshotPage';

export type SelectorType = 'css' | 'xpath';

export type InteractAction = 'click' | 'type' | 'press' | 'selectOption';

export type WaitForState = 'appear' | 'disappear' | 'stable';

export type ScreenshotMode = 'viewport' | 'fullpage';

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
  mimeType: string;
  dataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  scale: number;
  tileCount: number;
}


