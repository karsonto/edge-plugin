/**
 * AI 服务 - OpenAI API 集成
 */

import type { ChatMessage, AIConfig } from '@/shared/types';
import { API_ENDPOINTS } from '@/shared/constants';

function normalizeCustomEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();

    // 针对 DeepSeek OpenAI 兼容接口的常见输入错误做纠正
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

/**
 * OpenAI API 客户端
 */
export class AIService {
  private apiKey: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private endpoint: string;
  private topP?: number;
  private repetitionPenalty?: number;
  private requireApiKey: boolean;

  constructor(config: AIConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.temperature = config.temperature || 0.7;
    this.maxTokens = config.maxTokens || 2000;
    this.topP = config.topP;
    this.repetitionPenalty = config.repetitionPenalty;
    this.requireApiKey = config.provider !== 'custom';
    
    // 支持自定义端点
    if (config.provider === 'custom' && config.customEndpoint) {
      this.endpoint = normalizeCustomEndpoint(config.customEndpoint);
    } else {
      const providerKey = config.provider.toUpperCase() as keyof typeof API_ENDPOINTS;
      this.endpoint = API_ENDPOINTS[providerKey] || API_ENDPOINTS.OPENAI;
    }
  }

  /**
   * 发送聊天请求（流式）
   */
  async *streamChat(messages: ChatMessage[]): AsyncGenerator<string> {
    if (this.requireApiKey && !this.apiKey) {
      throw new Error('API Key 未配置');
    }

    // 构建请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // If user provided an API key, send it. Custom endpoints may or may not require auth.
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    // 构建请求体
    const body: any = {
      model: this.model,
      messages: messages.map(({ role, content }) => ({ role, content })),
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: true,
    };

    // 添加可选参数
    if (this.topP !== undefined) {
      body.top_p = this.topP;
    }
    if (this.repetitionPenalty !== undefined) {
      body.repetition_penalty = this.repetitionPenalty;
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      const rawText = await response.text();

      let message = '';
      if (rawText) {
        // 尝试从 JSON 格式中提取错误信息
        if (contentType.includes('application/json') || rawText.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(rawText);
            message = parsed?.error?.message || parsed?.message || '';
          } catch {
            // ignore json parse error
          }
        }

        if (!message) {
          message = rawText.slice(0, 500);
        }
      }

      throw new Error(message || `API 错误: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法读取响应流');
    }

    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          // SSE 行可能是 `data: {...}` 或 `data:{...}`（有无空格都存在）
          if (line.startsWith('data:')) {
            const data = line.slice(5).trimStart();
            
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              
              if (content) {
                yield content;
              }
            } catch (e) {
              // 跳过解析错误的行
              console.warn('Failed to parse SSE data:', data);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 发送聊天请求（非流式，支持 function calling）
   */
  async chat(
    messages: ChatMessage[],
    options?: {
      tools?: any[];
      tool_choice?: 'auto' | 'required' | 'none';
    }
  ): Promise<{
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
  }> {
    if (this.requireApiKey && !this.apiKey) {
      throw new Error('API Key 未配置');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const body: any = {
      model: this.model,
      messages: messages.map(({ role, content, tool_calls, tool_call_id, name }) => {
        const msg: any = { role, content };
        if (tool_calls) msg.tool_calls = tool_calls;
        if (tool_call_id) msg.tool_call_id = tool_call_id;
        if (name) msg.name = name;
        return msg;
      }),
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: false,
    };

    if (this.topP !== undefined) {
      body.top_p = this.topP;
    }
    if (this.repetitionPenalty !== undefined) {
      body.repetition_penalty = this.repetitionPenalty;
    }

    // 添加 tools 支持
    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = options.tool_choice || 'auto';
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      const rawText = await response.text();
      let message = '';

      if (rawText) {
        if (contentType.includes('application/json') || rawText.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(rawText);
            message = parsed?.error?.message || parsed?.message || '';
          } catch {
            // ignore json parse error
          }
        }
        if (!message) message = rawText.slice(0, 500);
      }

      throw new Error(message || `API 错误: ${response.status}`);
    }

    const data = await response.json();
    const responseMessage = data.choices?.[0]?.message;

    return {
      content: responseMessage?.content || null,
      tool_calls: responseMessage?.tool_calls || []
    };
  }

  /**
   * 验证 API Key
   */
  async validateApiKey(): Promise<boolean> {
    try {
      await this.chat([
        { role: 'user', content: 'Hi', timestamp: Date.now() }
      ]);
      return true;
    } catch (error) {
      return false;
    }
  }
}
