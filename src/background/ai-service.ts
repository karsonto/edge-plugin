/**
 * AI 服务 - OpenAI API 集成
 */

import { createParser, type EventSourceMessage } from 'eventsource-parser';
import {
  buildOpenAICompatibleBody,
  buildOpenAICompatibleHeaders,
  extractOpenAICompatibleError,
  getOpenAICompatibleEndpoint,
} from '@/shared/ai/openai-compatible';
import type { ChatMessage, AIConfig } from '@/shared/types';

/**
 * OpenAI API 客户端
 */
export class AIService {
  private apiKey: string;
  private endpoint: string;
  private requireApiKey: boolean;
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
    this.apiKey = config.apiKey;
    this.requireApiKey = config.provider === 'openai';
    this.endpoint = getOpenAICompatibleEndpoint(config);
  }

  private buildHeaders() {
    return buildOpenAICompatibleHeaders(this.config);
  }

  private buildBody(messages: ChatMessage[], options?: { stream?: boolean; tools?: any[]; tool_choice?: 'auto' | 'required' | 'none' }) {
    return buildOpenAICompatibleBody(this.config, messages, options);
  }

  /**
   * 发送聊天请求（流式）
   */
  async *streamChat(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
    if (this.requireApiKey && !this.apiKey) {
      throw new Error('API Key 未配置');
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(this.buildBody(messages, { stream: true })),
      signal,
    });

    if (!response.ok) {
      throw new Error(await extractOpenAICompatibleError(response));
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法读取响应流');
    }

    const decoder = new TextDecoder();
    const chunks: string[] = [];
    const parser = createParser({
      onEvent(event: EventSourceMessage) {
        if (!event.data || event.data === '[DONE]') {
          return;
        }

        try {
          const parsed = JSON.parse(event.data);
          const delta = parsed.choices?.[0]?.delta;
          const content = delta?.content;
          if (typeof content === 'string' && content.length > 0) {
            chunks.push(content);
          }
        } catch {
          console.warn('Failed to parse SSE data:', event.data);
        }
      },
    });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        parser.feed(decoder.decode(value, { stream: true }));
        while (chunks.length > 0) {
          const nextChunk = chunks.shift();
          if (nextChunk) {
            yield nextChunk;
          }
        }
      }

      parser.feed(decoder.decode());
      while (chunks.length > 0) {
        const nextChunk = chunks.shift();
        if (nextChunk) {
          yield nextChunk;
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

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(
        this.buildBody(messages, {
          stream: false,
          tools: options?.tools,
          tool_choice: options?.tool_choice,
        })
      ),
    });

    if (!response.ok) {
      throw new Error(await extractOpenAICompatibleError(response));
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
