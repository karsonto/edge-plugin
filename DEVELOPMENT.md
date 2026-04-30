# 开发文档

这份文档只描述当前仓库里的真实实现，目标是让开发者或 AI 助手在不通读整个项目的前提下，快速理解结构、入口和修改边界。

## 一句话架构

这是一个 `Chrome/Edge Manifest V3` 侧边栏扩展：

- `background` 负责消息路由、配置存储、PDF 抓取和截图能力
- `content script` 负责页面内容提取和页面内工具执行
- `sidepanel` 负责 React UI、对话、文件上下文和 agent 驱动

## 入口文件

- [manifest.json](/Users/karson/edage_plugin/manifest.json:1)
  定义 MV3 权限、content script、background、side panel、快捷键
- [src/background/index.ts](/Users/karson/edage_plugin/src/background/index.ts:1)
  background service worker 入口
- [src/content/index.ts](/Users/karson/edage_plugin/src/content/index.ts:1)
  content script 入口
- [src/sidepanel/index.tsx](/Users/karson/edage_plugin/src/sidepanel/index.tsx:1)
  sidepanel React 挂载入口
- [src/sidepanel/App.tsx](/Users/karson/edage_plugin/src/sidepanel/App.tsx:19)
  sidepanel 主界面和主要交互编排

## 目录职责

### `src/background/`

- `index.ts`
  注册扩展生命周期、消息监听、图标点击、快捷键
- `message-handler.ts`
  background 的核心路由层
- `storage-manager.ts`
  `chrome.storage.local` 配置读写
- `screenshot-service.ts`
  使用扩展权限进行截图
- `ai-service.ts`
  当前主要用于辅助型 AI 请求，例如 continuity summary

### `src/content/`

- `index.ts`
  content script 消息入口、工具执行、截图目标选择
- `text-extractor.ts`
  页面上下文抽取
- `readability-extractor.ts`
  `readability` 抽取正文
- `browser-tools.ts`
  页面读取和交互工具
- `aria-tools.ts`
  基于语义树的定位、检索、交互与等待
- `overlay.ts`
  页面高亮和选择反馈
- `selection-handler.ts`
  文本选择监听，悬浮按钮逻辑尚未完成

### `src/sidepanel/`

- `App.tsx`
  聊天页、设置页、快捷操作、文件拖拽、上下文拼接
- `hooks/useChat.ts`
  聊天消息状态和 agent 生命周期
- `hooks/usePageContext.ts`
  通过 background 拉取页面内容
- `hooks/useSettings.ts`
  设置读写和 Zustand 状态
- `hooks/useFileContext.ts`
  文件解析与附件上下文管理
- `agent/browser-agent.ts`
  基于 `pi-agent` 的浏览器 agent 封装

### `src/shared/`

- `types/`
  跨模块共享类型
- `utils/message-bridge.ts`
  `runtime.sendMessage / tabs.sendMessage` 封装
- `utils/file-parser.ts`
  `txt / pdf / docx / pptx` 文件解析
- `ai/openai-compatible.ts`
  OpenAI-compatible 请求拼装
- `ai/compression.ts`
  长上下文压缩
- `ai/context-memory.ts`
  对话记忆和页面摘要格式化

## 真实消息流

### 页面抓取

1. sidepanel 调用 `GET_PAGE_CONTEXT`
2. background 根据 `tabId` 获取标签信息
3. 如果 URL 是 PDF：
   background 直接 `fetch(url)` 并调用 `parsePDFBuffer`
4. 如果是普通网页：
   background 转发给 content script
5. content script 调用 `extractPageContext(strategy)`
6. 结果回到 sidepanel，并缓存到 `chrome.storage.local`

关键代码：

- [src/sidepanel/hooks/usePageContext.ts](/Users/karson/edage_plugin/src/sidepanel/hooks/usePageContext.ts:1)
- [src/background/message-handler.ts](/Users/karson/edage_plugin/src/background/message-handler.ts:71)
- [src/content/text-extractor.ts](/Users/karson/edage_plugin/src/content/text-extractor.ts:14)

### 对话发送

1. `App.tsx` 组装用户输入、网页上下文、文件上下文
2. `useChat.sendMessage()` 写入用户消息
3. `useChat` 确保 browser agent 已创建
4. agent 用当前 AI 配置发起推理
5. 如果启用工具模式，agent 会通过 content script 调用页面工具
6. 工具状态和最终回复回写到聊天列表

关键代码：

- [src/sidepanel/App.tsx](/Users/karson/edage_plugin/src/sidepanel/App.tsx:222)
- [src/sidepanel/hooks/useChat.ts](/Users/karson/edage_plugin/src/sidepanel/hooks/useChat.ts:363)
- [src/sidepanel/agent/browser-agent.ts](/Users/karson/edage_plugin/src/sidepanel/agent/browser-agent.ts:918)

### 文件上下文

1. 用户拖入文件
2. `useFileContext.addFiles()` 逐个解析
3. 解析后的文本按 `[文件: xxx]` 形式拼接
4. 发送消息时与网页上下文一起进入 prompt

关键代码：

- [src/sidepanel/hooks/useFileContext.ts](/Users/karson/edage_plugin/src/sidepanel/hooks/useFileContext.ts:1)
- [src/shared/utils/file-parser.ts](/Users/karson/edage_plugin/src/shared/utils/file-parser.ts:1)

## 当前支持范围

### AI Provider

当前只支持：

- `openai`
- `custom`，即任意 OpenAI-compatible Chat Completions 端点

不要假设项目已支持 `Anthropic` 或 `Gemini`，除非代码后续新增了 provider 类型和实际实现。

### 文件类型

当前可解析：

- `txt`
- `pdf`
- `docx`
- `pptx`

旧版 `doc/ppt` 会显式报不支持。

### 页面抓取策略

当前设置项中的抓取策略只暴露两种：

- `full`
- `readability`

`text-extractor.ts` 内部还保留了 `selected/main/auto` 分支，但当前设置 UI 和常用主链路不以它们为主。

## 当前自动化工具策略

页面自动化当前采用“ARIA 优先，旧工具回退”的策略。

### 主路径工具

- `readAriaTree`
- `findAriaNodes`
- `ariaInspect`
- `ariaInteract`
- `waitForAria`
- `screenshotPage`

### 回退工具

- `findByText`
- `query`
- `inspectElement`
- `getValue`
- `interact`
- `waitFor`
- `getVisibleText`

建议理解方式：

- 主路径负责提高定位和验证成功率
- 回退工具只在 ARIA 信息不足、语义树过 sparse、或页面实现不规范时使用

### 这次改动后的关键行为

- Agent 默认更偏向用 `findAriaNodes` 找候选 ref，而不是每次都读整棵树
- 工具执行失败时，失败结果会继续返回给模型，供其切换策略
- 工具结果会带更结构化的明细，模型不再只看到一句摘要
- `waitFor` / `waitForAria` 的超时上限提升到 30 秒

## 已存在但未完全接线的配置

以下配置项已经出现在类型和设置面板里，但不要默认它们已经完整生效：

- `behavior.autoCapture`
- `behavior.showFloatingButton`
- `privacy.excludeDomains`

例如：

- `showFloatingButton` 当前在 content script 初始化时被写死为 `false`
- `selection-handler.ts` 的悬浮按钮显示逻辑还是 `TODO`
- `excludeDomains` 目前没有看到统一入口拦截逻辑

因此做开发或写文档时，应明确区分：

- “设置项存在”
- “运行时行为已完整落地”

## 开发命令

```bash
npm install
npm run dev
npm run build
npm run type-check
```

## 调试位置

- Side Panel
  在侧边栏中右键，选择“检查”
- Background Service Worker
  打开 `chrome://extensions/`，进入当前扩展的 service worker 控制台
- Content Script
  在目标网页打开 DevTools，查看 Console

## 修改建议

### 改 UI 或交互时，优先看

- [src/sidepanel/App.tsx](/Users/karson/edage_plugin/src/sidepanel/App.tsx:19)
- [src/sidepanel/components/](/Users/karson/edage_plugin/src/sidepanel/components)
- [src/sidepanel/hooks/useSettings.ts](/Users/karson/edage_plugin/src/sidepanel/hooks/useSettings.ts:1)

### 改页面抓取时，优先看

- [src/content/text-extractor.ts](/Users/karson/edage_plugin/src/content/text-extractor.ts:14)
- [src/content/readability-extractor.ts](/Users/karson/edage_plugin/src/content/readability-extractor.ts:1)
- [src/shared/utils/text-processor.ts](/Users/karson/edage_plugin/src/shared/utils/text-processor.ts:1)

### 改工具调用或自动化时，优先看

- [src/sidepanel/agent/browser-agent.ts](/Users/karson/edage_plugin/src/sidepanel/agent/browser-agent.ts:918)
- [src/sidepanel/agent/content-tool-bridge.ts](/Users/karson/edage_plugin/src/sidepanel/agent/content-tool-bridge.ts:1)
- [src/content/browser-tools.ts](/Users/karson/edage_plugin/src/content/browser-tools.ts:1)

### 改配置或 provider 时，优先看

- [src/shared/types/config.ts](/Users/karson/edage_plugin/src/shared/types/config.ts:1)
- [src/shared/constants.ts](/Users/karson/edage_plugin/src/shared/constants.ts:1)
- [src/shared/ai/openai-compatible.ts](/Users/karson/edage_plugin/src/shared/ai/openai-compatible.ts:1)

## 读代码建议

如果是 AI 助手或新开发者，不需要先扫全仓库。建议按这个顺序读：

1. [PROJECT_CONTEXT.md](/Users/karson/edage_plugin/PROJECT_CONTEXT.md:1)
2. [README.md](/Users/karson/edage_plugin/README.md:1)
3. [src/sidepanel/App.tsx](/Users/karson/edage_plugin/src/sidepanel/App.tsx:19)
4. [src/sidepanel/hooks/useChat.ts](/Users/karson/edage_plugin/src/sidepanel/hooks/useChat.ts:333)
5. [src/background/message-handler.ts](/Users/karson/edage_plugin/src/background/message-handler.ts:16)
6. [src/content/index.ts](/Users/karson/edage_plugin/src/content/index.ts:71)
