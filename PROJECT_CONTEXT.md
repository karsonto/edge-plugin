# Project Context

这份文档给开发者和 AI 助手快速建立项目上下文，目标是在不全量阅读仓库的情况下，先掌握真实入口、主链路、约束和容易误判的地方。

## 项目定位

这是一个基于 `Manifest V3` 的 Chrome/Edge 侧边栏插件。

核心能力：

- 抓取当前网页内容
- 解析 PDF 页面
- 解析拖拽进入侧边栏的附件
- 用当前网页和附件作为上下文进行对话
- 可选地进入“页面读取工具”模式，让 Agent 调用浏览器页面工具

当前自动化主策略：

- 优先走 `ARIA` 工具链定位和操作
- 旧的文本/CSS 工具作为回退路径
- 工具失败结果继续返回给模型，用于自恢复

## 当前技术栈

- `TypeScript`
- `React 18`
- `Zustand`
- `Vite`
- `@crxjs/vite-plugin`
- `@mozilla/readability`
- `pdfjs-dist`
- `jszip`
- `@mariozechner/pi-agent-core`
- `@mariozechner/pi-ai`

## 先读这些文件

1. [manifest.json](/Users/karson/edage_plugin/manifest.json:1)
2. [src/sidepanel/App.tsx](/Users/karson/edage_plugin/src/sidepanel/App.tsx:19)
3. [src/sidepanel/hooks/useChat.ts](/Users/karson/edage_plugin/src/sidepanel/hooks/useChat.ts:333)
4. [src/background/message-handler.ts](/Users/karson/edage_plugin/src/background/message-handler.ts:16)
5. [src/content/index.ts](/Users/karson/edage_plugin/src/content/index.ts:71)
6. [src/content/text-extractor.ts](/Users/karson/edage_plugin/src/content/text-extractor.ts:14)
7. [src/shared/types/message.ts](/Users/karson/edage_plugin/src/shared/types/message.ts:1)

## 三层结构

### 1. Background

职责：

- 扩展生命周期
- 消息路由
- 配置存储
- PDF 页面抓取和解析
- 截图

主文件：

- [src/background/index.ts](/Users/karson/edage_plugin/src/background/index.ts:1)
- [src/background/message-handler.ts](/Users/karson/edage_plugin/src/background/message-handler.ts:1)
- [src/background/storage-manager.ts](/Users/karson/edage_plugin/src/background/storage-manager.ts:1)

### 2. Content Script

职责：

- 提取页面上下文
- 处理页面内工具调用
- 高亮选区 / 截图目标选择

主文件：

- [src/content/index.ts](/Users/karson/edage_plugin/src/content/index.ts:1)
- [src/content/text-extractor.ts](/Users/karson/edage_plugin/src/content/text-extractor.ts:1)
- [src/content/browser-tools.ts](/Users/karson/edage_plugin/src/content/browser-tools.ts:1)

### 3. Sidepanel

职责：

- React UI
- 用户输入与聊天列表
- 页面上下文 / 文件上下文拼接
- Agent 生命周期
- 设置页

主文件：

- [src/sidepanel/App.tsx](/Users/karson/edage_plugin/src/sidepanel/App.tsx:19)
- [src/sidepanel/hooks/useChat.ts](/Users/karson/edage_plugin/src/sidepanel/hooks/useChat.ts:1)
- [src/sidepanel/hooks/useSettings.ts](/Users/karson/edage_plugin/src/sidepanel/hooks/useSettings.ts:1)
- [src/sidepanel/hooks/useFileContext.ts](/Users/karson/edage_plugin/src/sidepanel/hooks/useFileContext.ts:1)

## 真正的对话主链路

容易误判的一点：

- `background/ai-service.ts` 存在，但它不是当前普通聊天的主入口
- 当前普通聊天主链路在 `sidepanel/hooks/useChat.ts`
- `useChat` 会创建 `browser-agent`
- `browser-agent` 负责模型调用、上下文压缩、工具执行事件回传

结论：

- 如果要改“普通对话行为”，先看 `useChat.ts` 和 `browser-agent.ts`
- 如果要改“后台辅助 AI 调用”，再看 `background/ai-service.ts`

## 当前工具主路径

当前推荐把浏览器自动化理解成 4 步：

1. `findAriaNodes`
   先按 `role / name / text` 找到少量候选 ref
2. `ariaInspect`
   读取节点状态、值、附近文本和可用动作
3. `ariaInteract`
   执行动作
4. `waitForAria` 或再次 `ariaInspect`
   验证结果

`readAriaTree` 仍然保留，但现在更适合这两类场景：

- 需要整体理解页面结构
- 需要读取某个局部子树而不是全页

旧工具如 `query / findByText / inspectElement / getValue / interact / waitFor / getVisibleText` 当前定位为回退工具。

## 页面上下文链路

```text
Sidepanel
  -> GET_PAGE_CONTEXT
Background
  -> 如果是 PDF：fetch + parsePDFBuffer
  -> 如果是普通网页：转发给 content script
Content Script
  -> extractPageContext()
  -> PAGE_CONTEXT_RESPONSE
Sidepanel
```

关键点：

- sidepanel 发起请求时会显式带 `tabId`
- background 会把抓取结果缓存进 `chrome.storage.local`
- PDF 页面不依赖 content script DOM 抽取

## prompt 组装逻辑

在 `App.tsx` 里，发送一条消息前会做这些事：

1. 取用户输入
2. 读取当前页面内容
3. 读取拖拽附件内容
4. 根据“携带网页内容”开关决定是否注入页面内容
5. 合并成最终 prompt
6. 交给 `useChat.sendMessage()`

这意味着：

- 页面内容和附件内容都可能进入同一轮 prompt
- 快捷操作和手输消息共用相同的上下文拼接思路

## 当前支持的 AI 接口

只支持两种 provider：

- `openai`
- `custom`

其中 `custom` 表示任意 OpenAI-compatible Chat Completions 端点。

不要假设已经支持：

- Anthropic
- Gemini
- 原生 Responses API

除非后续代码新增了 provider 类型、配置 UI 和请求实现。

## 当前支持的文件类型

- `txt`
- `pdf`
- `docx`
- `pptx`

解析实现位于 [src/shared/utils/file-parser.ts](/Users/karson/edage_plugin/src/shared/utils/file-parser.ts:1)。

旧格式 `doc` / `ppt` 会报错提示转换为新版格式。

## 容易误判的“配置已存在但未完整生效”

这些项在类型、默认配置或设置面板中存在，但当前不能默认它们已经完整接入：

- `behavior.autoCapture`
- `behavior.showFloatingButton`
- `privacy.excludeDomains`

例如：

- `showFloatingButton` 在 content script 初始化时被写成 `false`
- `SelectionHandler.showFloatingButton()` 还是 `TODO`
- `excludeDomains` 没有统一的主链路拦截实现

因此任何文档、评审或开发说明都应区分：

- “设置项存在”
- “设置项已驱动真实运行时行为”

## 上下文压缩和 memory

项目已经有一套面向长对话的压缩逻辑：

- [src/shared/ai/compression.ts](/Users/karson/edage_plugin/src/shared/ai/compression.ts:1)
- [src/shared/ai/context-memory.ts](/Users/karson/edage_plugin/src/shared/ai/context-memory.ts:1)

用途：

- 去重 system message
- 压缩旧工具结果
- 构建长期记忆摘要 / 阶段记忆摘要
- 在上下文过长时生成 continuity summary

如果要改长对话表现，不要只在 UI 层拼字符串，先看这两处。

## 当前自动化效果相关的关键实现

这次为了提高成功率，已经做了这些方向的调整：

- 新增 `findAriaNodes`，减少模型从整棵语义树手动挑 ref 的负担
- 工具结果改为“摘要 + 结构化明细”一起喂给模型
- 工具失败时不再一律抛异常中断，而是把失败结果回传给模型继续决策
- 等待超时上限从 15 秒放宽到 30 秒

如果后续继续优化浏览器自动化，优先看：

- [src/sidepanel/agent/browser-agent.ts](/Users/karson/edage_plugin/src/sidepanel/agent/browser-agent.ts:1)
- [src/content/aria-tools.ts](/Users/karson/edage_plugin/src/content/aria-tools.ts:1)
- [src/content/browser-tools.ts](/Users/karson/edage_plugin/src/content/browser-tools.ts:1)

## 修改建议

### 改消息协议

先看：

- [src/shared/types/message.ts](/Users/karson/edage_plugin/src/shared/types/message.ts:1)
- [src/shared/utils/message-bridge.ts](/Users/karson/edage_plugin/src/shared/utils/message-bridge.ts:1)

### 改页面提取

先看：

- [src/content/text-extractor.ts](/Users/karson/edage_plugin/src/content/text-extractor.ts:1)
- [src/content/readability-extractor.ts](/Users/karson/edage_plugin/src/content/readability-extractor.ts:1)

### 改对话或工具模式

先看：

- [src/sidepanel/hooks/useChat.ts](/Users/karson/edage_plugin/src/sidepanel/hooks/useChat.ts:1)
- [src/sidepanel/agent/browser-agent.ts](/Users/karson/edage_plugin/src/sidepanel/agent/browser-agent.ts:1)
- [src/content/browser-tools.ts](/Users/karson/edage_plugin/src/content/browser-tools.ts:1)

### 改配置

先看：

- [src/shared/types/config.ts](/Users/karson/edage_plugin/src/shared/types/config.ts:1)
- [src/shared/constants.ts](/Users/karson/edage_plugin/src/shared/constants.ts:1)
- [src/sidepanel/components/Settings/](/Users/karson/edage_plugin/src/sidepanel/components/Settings)

## 给 AI 助手的工作规则

如果只是为了理解项目，不需要全仓库扫描。建议流程：

1. 先读本文件
2. 再读 `README.md`
3. 再读 `App.tsx`、`useChat.ts`、`message-handler.ts`
4. 只有在任务涉及具体子系统时，再深入对应目录

这样能显著减少无效上下文消耗。
