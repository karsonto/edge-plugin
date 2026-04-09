/**
 * AI 服务 - OpenAI API 集成
 */

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
