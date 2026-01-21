# 智能助手 开发文档

## 项目架构

智能助手是一个基于 Chrome Manifest V3 的浏览器插件，使用 React + TypeScript + Vite 构建。

### 核心模块

1. **Content Script** (`src/content/`)
   - 在网页中运行，负责提取页面内容
   - 处理用户文本选择
   - 与 background 通信

2. **Background Service Worker** (`src/background/`)
   - 处理 AI API 调用（OpenAI）
   - 管理消息路由
   - 存储管理（chrome.storage）

3. **Side Panel UI** (`src/sidepanel/`)
   - React 应用，提供用户界面
   - 对话功能
   - 设置面板
   - 快捷操作

### 技术栈

- **框架**: React 18 + Hooks
- **语言**: TypeScript
- **构建**: Vite + CRXJS
- **样式**: Tailwind CSS
- **状态管理**: Zustand
- **图标**: Lucide React

## 开发流程

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式

```bash
npm run dev
```

这会启动 Vite 开发服务器，并在 `dist` 目录生成插件文件。

### 3. 在浏览器中加载

1. 打开 Chrome/Edge
2. 访问 `chrome://extensions/`
3. 启用"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目的 `dist` 文件夹

### 4. 调试

- **Side Panel**: 右键点击侧边栏 → 检查
- **Background**: 在扩展管理页面点击"Service Worker"
- **Content Script**: 在网页中打开开发者工具 → Console

## 消息通信

插件使用 Chrome Extension 消息 API 进行跨模块通信：

```
┌──────────┐         ┌────────────┐         ┌───────────┐
│ Content  │ ←────→  │ Background │ ←────→  │ SidePanel │
│ Script   │         │  Worker    │         │    UI     │
└──────────┘         └────────────┘         └───────────┘
      │                     │                      │
      │                     ↓                      │
      │              ┌────────────┐               │
      │              │  OpenAI    │               │
      │              │    API     │               │
      │              └────────────┘               │
      │                                            │
      └─────────── chrome.storage ────────────────┘
```

## 核心功能实现

### 1. 页面内容提取

```typescript
// src/content/text-extractor.ts
export function extractPageContext(): PageContext {
  // 智能提取主要内容
  // 支持多种策略：auto, main, full, selected
}
```

### 2. AI 对话（流式响应）

```typescript
// src/background/ai-service.ts
async *streamChat(messages: ChatMessage[]): AsyncGenerator<string> {
  // 使用 Server-Sent Events 实现流式响应
  // 逐字显示 AI 回复
}
```

### 3. 快捷操作

快捷操作支持提示词模板，使用 `{context}` 占位符：

```typescript
const prompt = '请总结以下内容：\n\n{context}';
// {context} 会被替换为实际的页面内容
```

### 4. 配置持久化

使用 `chrome.storage.local` 存储用户配置：

```typescript
// 保存
await chrome.storage.local.set({ edage_config: config });

// 加载
const result = await chrome.storage.local.get('edage_config');
```

## 代码规范

- 使用 TypeScript 严格模式
- 组件使用函数式组件 + Hooks
- 使用 ESLint 和 Prettier 格式化代码
- 导入使用路径别名 `@/`

## 性能优化

- React 组件使用 memo 避免不必要的重渲染
- 大型列表使用虚拟滚动
- 图片懒加载
- 代码分割（Vite 自动处理）

## 安全性

- API Key 存储在 chrome.storage.local（本地加密）
- 支持域名黑名单，敏感网站不捕获内容
- 使用 Content Security Policy (CSP)
- 输入验证和 XSS 防护

## 故障排除

### 插件无法加载
- 检查 `manifest.json` 语法
- 确保所有必需文件存在
- 查看浏览器扩展管理页面的错误信息

### Content Script 未注入
- 检查 `matches` 配置
- 刷新页面
- 查看控制台错误

### API 调用失败
- 验证 API Key 是否正确
- 检查网络连接
- 查看 Background Worker 日志

## 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 许可证

MIT License
