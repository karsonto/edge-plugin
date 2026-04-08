import { API_ENDPOINTS } from '@/shared/constants';
import type { AIConfig, ChatMessage } from '@/shared/types';

export interface OpenAICompatibleRequestOptions {
  stream?: boolean;
  tools?: any[];
  tool_choice?: 'auto' | 'required' | 'none';
}

export function normalizeOpenAICompatibleEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();

    if (host.includes('deepseek')) {
      const path = url.pathname.replace(/\/+$/, '');

      if (path === '' || path === '/') {
        url.pathname = '/v1/chat/completions';
      } else if (path === '/chat/completion' || path === '/chat/completions') {
        url.pathname = '/v1/chat/completions';
      } else if (path === '/v1/chat/completion') {
        url.pathname = '/v1/chat/completions';
      }
    }

    return url.toString();
  } catch {
    return endpoint;
  }
}

export function getOpenAICompatibleEndpoint(config: AIConfig): string {
  if (config.provider === 'custom' && config.customEndpoint) {
    return normalizeOpenAICompatibleEndpoint(config.customEndpoint);
  }
  return API_ENDPOINTS.OPENAI;
}

export function toOpenAICompatibleBaseUrl(endpoint: string): string {
  const normalized = normalizeOpenAICompatibleEndpoint(endpoint);
  try {
    const url = new URL(normalized);
    const path = url.pathname.replace(/\/+$/, '');

    const suffixes = ['/v1/chat/completions', '/chat/completions'];
    for (const suffix of suffixes) {
      if (path.endsWith(suffix)) {
        const nextPath = path.slice(0, -suffix.length) || (suffix.startsWith('/v1') ? '/v1' : '');
        url.pathname = nextPath || '/';
        return url.toString().replace(/\/$/, '');
      }
    }

    return normalized.replace(/\/$/, '');
  } catch {
    return normalized.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
  }
}

export function buildOpenAICompatibleHeaders(config: AIConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  return headers;
}

export function buildOpenAICompatibleBody(
  config: AIConfig,
  messages: ChatMessage[],
  options?: OpenAICompatibleRequestOptions
) {
  const body: any = {
    model: config.model,
    messages: messages.map(({ role, content, tool_calls, tool_call_id, name }) => {
      const message: any = { role, content };
      if (tool_calls) message.tool_calls = tool_calls;
      if (tool_call_id) message.tool_call_id = tool_call_id;
      if (name) message.name = name;
      return message;
    }),
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens || 65535,
    stream: Boolean(options?.stream),
  };

  if (config.topP !== undefined) {
    body.top_p = config.topP;
  }
  if (config.repetitionPenalty !== undefined) {
    body.repetition_penalty = config.repetitionPenalty;
  }
  if (options?.tools?.length) {
    body.tools = options.tools;
    body.tool_choice = options.tool_choice || 'auto';
  }

  return body;
}

export async function extractOpenAICompatibleError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  const rawText = await response.text();

  let message = '';
  if (rawText) {
    if (contentType.includes('application/json') || rawText.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(rawText);
        message =
          parsed?.error?.message ||
          parsed?.message ||
          parsed?.error?.details ||
          '';
      } catch {
        // ignore json parse error
      }
    }

    if (!message) {
      message = rawText.slice(0, 500);
    }
  }

  return message || `API 错误: ${response.status}`;
}
