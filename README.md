# 智能助手

一个基于 AI 的 Chrome/Edge 侧边栏插件，用于抓取网页内容、解析常见文档附件，并围绕当前页面进行对话。

当前实现基于 `Vite + TypeScript + React + Manifest V3`，支持普通网页内容提取、PDF 页面解析、文件拖拽解析，以及可选的浏览器页面读取工具模式。

## 当前真实功能

- 页面内容抓取
  - 支持普通网页内容提取
  - 支持选中文本优先
  - 支持两种抓取策略：`full` 和 `readability`
  - 支持 PDF 页面在 background 中直接抓取并解析
- 对话与快捷操作
  - 支持多轮对话
  - 支持将当前网页内容拼进本轮提问
  - 支持可配置快捷操作模板
- 文件上下文
  - 支持拖拽解析 `txt`、`pdf`、`docx`、`pptx`
  - 文件内容会与页面内容一起作为对话上下文
- AI 接口
  - 支持 `OpenAI 官方 Chat Completions`
  - 支持 `OpenAI-compatible / 自定义端点`
- 浏览器页面读取工具
  - 侧边栏可开启“页面读取工具”模式
  - Agent 可通过 content script 读取页面、执行低风险交互、截图
  - 默认优先走 `ARIA` 工具链，再回退到文本/CSS 工具
- 品牌参数化
  - 构建时可通过环境变量替换扩展名称、描述和默认端点

## 当前未完全落地或需要注意的点

- 设置面板中存在 `自动捕获页面内容`、`显示悬浮按钮`、`排除域名` 配置项
  但当前代码里并未全部完整接入运行时行为。
- 文档和代码里提到的 AI 能力应以当前实现为准：
  目前仅支持 `openai` 和 `custom(OpenAI-compatible)` 两种 provider。
- 对话主链路当前运行在 sidepanel 内的 agent，不是 README 旧版本描述的“全部由 background 直接发起 AI 对话”。

## 技术栈

- 浏览器平台：Chrome / Edge `Manifest V3`
- 开发语言：TypeScript
- UI：React 18
- 构建：Vite + CRXJS
- 样式：Tailwind CSS
- 状态管理：Zustand
- 文件解析：`pdfjs-dist`、`jszip`
- 页面正文抽取：`@mozilla/readability`
- Agent：`@mariozechner/pi-agent-core`、`@mariozechner/pi-ai`

## 项目结构

```text
edage_plugin/
├── manifest.json
├── sidepanel.html
├── src/
│   ├── background/              # service worker、存储、PDF 抓取、截图、消息路由
│   ├── content/                 # 页面提取、页面工具执行、截图目标选择
│   ├── sidepanel/               # React UI、聊天、设置、文件上下文
│   ├── shared/
│   │   ├── ai/                  # OpenAI-compatible、上下文压缩、memory
│   │   ├── types/               # 跨模块类型和消息协议
│   │   └── utils/               # 消息桥接、文本处理、文件解析等
│   └── assets/
├── README.md
├── DEVELOPMENT.md
├── QUICK_START.md
└── PROJECT_CONTEXT.md
```

## 关键运行链路

### 1. 页面内容抓取

1. sidepanel 通过 `GET_PAGE_CONTEXT` 向 background 请求上下文
2. background 判断当前页面是否为 PDF
3. PDF 页面由 background 直接 `fetch + parsePDFBuffer`
4. 普通网页由 background 转发给 content script
5. content script 调用 `extractPageContext()` 提取正文、选中文本、元数据

关键文件：

- [src/sidepanel/hooks/usePageContext.ts](/Users/karson/edage_plugin/src/sidepanel/hooks/usePageContext.ts:1)
- [src/background/message-handler.ts](/Users/karson/edage_plugin/src/background/message-handler.ts:71)
- [src/content/text-extractor.ts](/Users/karson/edage_plugin/src/content/text-extractor.ts:14)

### 2. 对话与 Agent

1. sidepanel 负责输入、快捷操作、页面上下文和文件上下文拼接
2. `useChat` 创建并驱动 browser agent
3. agent 在需要时通过消息协议调用 content script 中的页面工具
4. tool 执行状态会回显到聊天区

当前默认工具策略：

- 优先使用 `findAriaNodes / ariaInspect / ariaInteract / waitForAria`
- `readAriaTree` 用于理解整体结构或局部子树
- `findByText / query / inspectElement / getValue / interact / waitFor / getVisibleText` 作为回退工具
- 工具失败时会把失败结果继续返回给模型，而不是立即中断整轮自动化

关键文件：

- [src/sidepanel/App.tsx](/Users/karson/edage_plugin/src/sidepanel/App.tsx:19)
- [src/sidepanel/hooks/useChat.ts](/Users/karson/edage_plugin/src/sidepanel/hooks/useChat.ts:333)
- [src/sidepanel/agent/browser-agent.ts](/Users/karson/edage_plugin/src/sidepanel/agent/browser-agent.ts:918)
- [src/content/index.ts](/Users/karson/edage_plugin/src/content/index.ts:71)

### 3. 文件上下文

1. 用户向 sidepanel 拖入文件
2. `useFileContext` 按类型调用解析器
3. 解析后的文本内容与网页内容合并后参与对话

关键文件：

- [src/sidepanel/hooks/useFileContext.ts](/Users/karson/edage_plugin/src/sidepanel/hooks/useFileContext.ts:1)
- [src/shared/utils/file-parser.ts](/Users/karson/edage_plugin/src/shared/utils/file-parser.ts:1)

## 安装与构建

### 从源码构建

```bash
git clone https://github.com/karsonto/edge-plugin.git
cd edge-plugin
npm install
npm run build
```

构建产物在 `dist/`。

### 加载到浏览器

1. 打开 `chrome://extensions/`
2. 启用“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择项目中的 `dist/` 目录

## 使用方式

### 1. 配置 AI

在侧边栏“设置”中：

- `OpenAI 官方`
  - 需要填写 API Key
- `OpenAI-compatible / 自定义端点`
  - 需要填写兼容的 `/v1/chat/completions` 地址
  - API Key 可选，若填写则以 `Bearer Token` 发送

### 2. 网页对话

1. 打开任意网页
2. 点击插件图标或使用快捷键 `Ctrl+Shift+E`
3. 侧边栏会尝试抓取页面内容
4. 输入问题或点击快捷操作

### 3. 文件对话

1. 直接将 `txt/pdf/docx/pptx` 文件拖入侧边栏
2. 文件解析完成后，会出现在文件列表中
3. 后续提问会自动携带文件内容

### 4. 页面读取工具

聊天页底部可以开启“页面读取工具”：

- 开启后，Agent 可调用页面读取/交互工具
- 适合需要检查页面结构、读取局部状态、执行低风险交互的场景

当前建议的自动化路径：

1. 优先用 `findAriaNodes` 按 `role/name/text` 查目标
2. 再用 `ariaInspect` 确认节点状态和可用动作
3. 用 `ariaInteract` 执行动作
4. 用 `waitForAria` 或再次 `ariaInspect` 验证结果

当前推荐的验证方式：

- 输入框：优先等 `valueChanged`
- 下拉/选项：优先等 `selectedChanged`
- 折叠面板、弹层、展开按钮：优先等 `expandedChanged`
- 如果动作后状态仍不明确，再补一次 `ariaInspect`

复杂控件说明：

- 对自定义 `combobox/listbox`，当前 `selectOption` 已支持尝试定位关联弹层并点击选项
- 若页面语义不规范，仍可能需要回退到 `findByText / interact / screenshotPage`

## 可用环境变量

- `VITE_APP_NAME`
  用于覆盖扩展名称，默认值：`智能助手`
- `VITE_APP_DESC`
  用于覆盖扩展描述
- `VITE_DEFAULT_CUSTOM_ENDPOINT`
  用于覆盖 `custom` provider 的默认端点

示例：

```bash
VITE_APP_NAME="你的品牌名" \
VITE_APP_DESC="你的品牌名 - 你的描述" \
VITE_DEFAULT_CUSTOM_ENDPOINT="http://localhost:8080/v1/chat/completions" \
npm run build
```

## 开发命令

```bash
npm run dev
npm run build
npm run type-check
```

## 推荐阅读顺序

如果你是开发者或 AI 助手，先读这些文件：

1. [PROJECT_CONTEXT.md](/Users/karson/edage_plugin/PROJECT_CONTEXT.md:1)
2. [DEVELOPMENT.md](/Users/karson/edage_plugin/DEVELOPMENT.md:1)
3. [CUSTOM_API_SETUP.md](/Users/karson/edage_plugin/CUSTOM_API_SETUP.md:1)

## 许可证

MIT
