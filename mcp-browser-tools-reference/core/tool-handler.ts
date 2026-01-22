/**
 * Tool Handler - 工具响应格式和错误处理
 * 
 * 这是 MCP 工具的标准响应格式定义。
 */

import type { CallToolResult, TextContent, ImageContent } from '@modelcontextprotocol/sdk/types.js';

/**
 * 工具执行结果接口
 */
export interface ToolResult extends CallToolResult {
  content: (TextContent | ImageContent)[];
  isError: boolean;
}

/**
 * 工具执行器接口
 */
export interface ToolExecutor {
  execute(args: any): Promise<ToolResult>;
}

/**
 * 创建错误响应
 * @param message 错误消息
 * @returns 标准错误响应格式
 */
export const createErrorResponse = (
  message: string = 'Unknown error, please try again',
): ToolResult => {
  return {
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
    isError: true,
  };
};

/**
 * 创建成功响应
 * @param data 响应数据
 * @returns 标准成功响应格式
 */
export const createSuccessResponse = (data: any): ToolResult => {
  return {
    content: [
      {
        type: 'text',
        text: typeof data === 'string' ? data : JSON.stringify(data),
      },
    ],
    isError: false,
  };
};

/**
 * 创建带图片的响应
 * @param text 文本内容
 * @param imageBase64 图片 base64 数据
 * @param mimeType 图片 MIME 类型
 * @returns 带图片的响应
 */
export const createImageResponse = (
  text: string,
  imageBase64: string,
  mimeType: string = 'image/png',
): ToolResult => {
  return {
    content: [
      {
        type: 'text',
        text,
      },
      {
        type: 'image',
        data: imageBase64,
        mimeType,
      } as ImageContent,
    ],
    isError: false,
  };
};
