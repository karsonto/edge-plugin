export type ToolName =
  | 'getPageInfo'
  | 'getVisibleText'
  | 'query'
  | 'findByText'
  | 'getValue';

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


