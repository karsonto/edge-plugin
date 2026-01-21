# 自定义 API 配置指南

本指南帮助你配置「智能助手」插件以使用自定义的 AI API（如本地部署的 Qwen3 模型）。

## 📋 支持的自定义 API 规范

插件现在支持与 OpenAI 兼容的自定义 API 端点，包括：

- **端点格式**: `http://your-server:port/v1/chat/completions`
- **请求方法**: POST
- **Content-Type**: application/json
- **支持参数**:
  - `model`: 模型名称
  - `messages`: 对话消息数组
  - `temperature`: 温度参数 (0-1)
  - `max_tokens`: 最大 token 数
  - `top_p`: Top-P 采样参数 (0-1)
  - `repetition_penalty`: 重复惩罚 (1.0-2.0)
  - `stream`: 是否流式响应

## 🚀 快速配置步骤

### 方法一：使用示例配置（Qwen3）

1. 打开「智能助手」插件
2. 切换到"设置"标签
3. 配置如下：
   - **AI 提供商**: 选择 "自定义"
   - **API Key**: 留空（如果你的 API 不需要认证）
   - **模型选择**: 选择 "Qwen3" 或输入你的模型名称
   - **自定义端点**: `http://123.192.49.73:8086/v1/chat/completions`
   
4. 展开"高级设置"：
   - **Temperature**: 0.5
   - **Max Tokens**: 1024
   - **Top P**: 0.8
   - **Repetition Penalty**: 1.05

5. 点击保存，开始使用！

### 方法二：修改默认配置

如果你想让插件默认使用自定义 API，可以修改 `src/shared/constants.ts`：

```typescript
export const DEFAULT_CONFIG: AppConfig = {
  ai: {
    provider: 'custom',
    apiKey: '', // 如果不需要认证，留空
    model: 'qwen3',
    temperature: 0.5,
    maxTokens: 1024,
    topP: 0.8,
    repetitionPenalty: 1.05,
    customEndpoint: 'http://123.192.49.73:8086/v1/chat/completions',
  },
  // ... 其他配置保持不变
};
```

然后重新构建：
```bash
npm run build
```

## 🔧 API 请求示例

配置完成后，插件会发送如下格式的请求：

```bash
curl --location --request POST 'http://123.192.49.73:8086/v1/chat/completions' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "qwen3",
    "messages": [
        {
            "role": "user",
            "content": "你的问题"
        }
    ],
    "temperature": 0.5,
    "top_p": 0.8,
    "repetition_penalty": 1.05,
    "max_tokens": 1024,
    "stream": true
}'
```

## 📝 注意事项

### 1. 认证方式
- 如果你的 API 端点包含 `123.192.49.73`，插件会自动跳过 `Authorization` header
- 对于其他自定义端点，如果需要认证，请在 API Key 字段输入你的认证令牌

### 2. 流式响应
- 插件默认使用流式响应（`stream: true`）
- 确保你的 API 支持 Server-Sent Events (SSE) 格式
- 响应格式应该兼容 OpenAI 的流式响应格式

### 3. 响应格式
插件期望的响应格式：

```json
{
    "id": "chatcmpl-xxx",
    "object": "chat.completion",
    "created": 1767769226,
    "model": "qwen3",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "回复内容"
            },
            "finish_reason": "stop"
        }
    ]
}
```

流式响应格式（SSE）：
```
data: {"choices":[{"delta":{"content":"你"}}]}
data: {"choices":[{"delta":{"content":"好"}}]}
data: [DONE]
```

## 🐛 故障排除

### 问题 1: 连接失败
- 检查端点 URL 是否正确
- 确保网络可以访问该端点
- 查看浏览器控制台的错误信息

### 问题 2: 响应格式错误
- 确保 API 返回的格式兼容 OpenAI API
- 检查 `choices[0].message.content` 或 `choices[0].delta.content` 是否存在

### 问题 3: 认证失败
- 如果需要 API Key，确保已正确配置
- 检查 API Key 是否有效

### 问题 4: 流式响应不工作
- 检查 API 是否支持 `stream: true` 参数
- 确认响应使用 Server-Sent Events 格式

## 🔍 调试技巧

1. **查看 Background Worker 日志**:
   - 打开 `chrome://extensions/`
   - 找到「智能助手」插件
   - 点击"Service Worker"查看日志

2. **查看网络请求**:
   - 在 Background Worker 控制台中查看 Network 标签
   - 检查发送的请求和响应

3. **测试 API**:
   ```bash
   curl -X POST http://123.192.49.73:8086/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{
       "model": "qwen3",
       "messages": [{"role": "user", "content": "测试"}],
       "stream": false
     }'
   ```

## 📚 更多信息

- 项目主文档: [README.md](README.md)
- 开发文档: [DEVELOPMENT.md](DEVELOPMENT.md)

如有问题，请查看项目 Issues 或提交新的 Issue。
