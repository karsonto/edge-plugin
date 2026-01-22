/**
 * Browser Use (路线A) 自动化协议类型
 * - ToolCall: 模型输出的工具调用
 * - ToolResult: content 执行工具后的结果
 * - StepLog: 每一步的可观测性日志（脱敏后可导出）
 */

export type ToolName =
  | 'getPageInfo'
  | 'getVisibleText'
  | 'query'
  | 'findByText'
  | 'click'
  | 'type'
  | 'scroll'
  | 'waitFor'
  // 新增工具
  | 'select'
  | 'check'
  | 'hover'
  | 'pressKey'
  | 'getValue'
  | 'screenshot'
  | 'download';

export type WaitForState = 'attached' | 'detached';

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
  /**
   * 高风险动作需要用户确认（提交/下载等）
   */
  requiresConfirmation?: boolean;
  confirmationReason?: 'submit' | 'download' | 'navigation' | 'sensitive_input' | 'unknown';
  /**
   * 用于 UI 呈现的提示文案（不包含敏感信息）
   */
  confirmationMessage?: string;
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

export type StepStatus = 'running' | 'waiting_confirmation' | 'completed' | 'failed' | 'cancelled';

export interface AutomationStepLog {
  stepId: string;
  tool: ToolName;
  args?: Record<string, any>;
  status: StepStatus;
  startedAt: number;
  endedAt?: number;
  result?: ToolResult;
  attempts?: number;
  locatorUsed?: string;
}

export type AutomationRunStatus = 'idle' | 'running' | 'waiting_confirmation' | 'done' | 'failed' | 'stopped';

export interface AutomationRunState {
  runId: string;
  tabId: number;
  goal: string;
  status: AutomationRunStatus;
  createdAt: number;
  updatedAt: number;
  steps: AutomationStepLog[];
  error?: string;
  finalAnswer?: string;
}

export interface ConfirmationRequestPayload {
  runId: string;
  stepId: string;
  title: string;
  description?: string;
  tool: ToolName;
}

export interface ConfirmationResponsePayload {
  runId: string;
  stepId: string;
  approved: boolean;
}


