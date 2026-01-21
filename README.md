智能助手 🚀

一个基于 AI 的浏览器插件，帮助你捕获网页内容并与 AI 对话，快速获取洞察。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)
![React](https://img.shields.io/badge/React-18.2-61dafb)

## ✨ 功能特性

- 🔍 **智能内容捕获** - 自动提取网页主要内容，支持选中文本
- ⚡ **快捷操作** - 可自定义的提示词模板，一键执行（总结、翻译、解释等）
- 💬 **AI 对话** - 基于页面内容与 AI 进行多轮对话
- 🎨 **现代化 UI** - 简洁美观的用户界面，流畅的动画效果
- 🔧 **灵活配置** - 支持 OpenAI、Anthropic、Gemini 等多种 AI 提供商
- 🔐 **隐私保护** - 本地存储配置，支持域名黑名单

## 🚀 快速开始

### 安装

#### 方式一：从源码构建

```bash
# 克隆项目
git clone https://github.com/karsonto/edge-plugin.git
cd edge-plugin

# 安装依赖
npm install

# 构建
npm run build
```

### 🏷️ 品牌参数化（打包前替换品牌名/描述）

本项目支持在 **构建（build）阶段** 通过环境变量注入品牌信息，用于生成扩展的：
- 扩展名称（`manifest.name`）
- 扩展描述（`manifest.description`）
- 扩展按钮提示（`action.default_title`）
- 快捷键命令描述（`commands.*.description`）
- Side Panel 标题（运行时 `document.title`）

#### 可用环境变量

- `VITE_APP_NAME`：品牌/产品名称（默认：`智能助手`）
- `VITE_APP_DESC`：扩展描述（默认：`{VITE_APP_NAME} - 捕获网页内容，与 AI 对话获取洞察`）
- `VITE_DEFAULT_CUSTOM_ENDPOINT`：自定义提供商（Custom）的**默认端点**（默认：`http://localhost:8080/v1/chat/completions`）

仓库提供了 `env.example` 作为示例（按你的 CI/终端环境设置同名变量即可）。

#### Windows PowerShell 示例（推荐）

```powershell
$env:VITE_APP_NAME="你的品牌名"
$env:VITE_APP_DESC="你的品牌名 - 你的描述文案"
$env:VITE_DEFAULT_CUSTOM_ENDPOINT="http://your-server:8080/v1/chat/completions"
npm run build
```

> 说明：`manifest.json` 的最终内容由构建配置在打包时动态生成，因此不需要手动改 `dist/manifest.json`。
> 说明：`VITE_DEFAULT_CUSTOM_ENDPOINT` 只影响“首次初始化/清空扩展存储后的默认值”；用户在设置里保存过的端点不会被覆盖。

#### 方式二：直接下载

从 [Releases](https://github.com/karsonto/edge-plugin/releases) 页面下载最新版本的 `.zip` 文件。

### 在浏览器中加载

1. 打开 Chrome/Edge 浏览器
2. 访问 `chrome://extensions/`
3. 启用右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择构建生成的 `dist` 文件夹（或解压后的文件夹）

## 📖 使用说明

### 1. 配置 API Key

首次使用需要配置 AI 提供商的 API Key：

1. 点击浏览器工具栏的「智能助手」图标
2. 切换到"设置"标签
3. 选择 AI 提供商（默认 OpenAI）
4. 输入您的 API Key
5. 选择模型（推荐 GPT-4 Turbo）

### 2. 浏览网页并对话

1. 访问任意网页
2. 点击「智能助手」图标打开侧边栏
3. 插件会自动提取页面内容
4. 使用快捷操作或直接输入问题
5. AI 会基于页面内容回答您的问题

### 3. 自定义快捷操作

在设置中可以添加和编辑快捷操作：

1. 切换到"设置"标签
2. 滚动到"快捷操作配置"
3. 点击"添加新的快捷操作"
4. 设置图标、名称和提示词模板
5. 使用 `{context}` 作为页面内容的占位符

**示例提示词：**
```
请用 3-5 个要点总结以下内容：

{context}
```

## 🛠️ 技术栈

- **浏览器平台**: Chrome/Edge (Manifest V3)
- **开发语言**: TypeScript
- **UI 框架**: React 18 + Hooks
- **构建工具**: Vite + CRXJS
- **样式方案**: Tailwind CSS
- **状态管理**: Zustand
- **AI 集成**: OpenAI API
- **图标库**: Lucide React

## 📁 项目结构

```
edage_plugin/
├── manifest.json              # 插件配置
├── src/
│   ├── background/           # 后台服务
│   │   ├── index.ts
│   │   ├── ai-service.ts    # AI API 集成
│   │   └── storage-manager.ts
│   ├── content/              # 内容脚本
│   │   ├── index.ts
│   │   └── text-extractor.ts
│   ├── sidepanel/            # React UI
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── hooks/
│   └── shared/               # 共享代码
│       ├── types/
│       └── utils/
├── package.json
└── README.md
```

## 🎯 核心功能

### 智能文本提取

- 自动识别网页主要内容
- 支持用户选中文本
- 智能过滤广告和导航元素
- 提取页面元数据（标题、作者、发布时间）

### AI 对话

- 流式响应，逐字显示
- 支持多轮对话
- 自动附加页面上下文
- 错误处理和重试

### 快捷操作

- 预设常用操作（总结、翻译、解释、提取要点）
- 完全可自定义
- 支持提示词模板
- 一键执行

## ⚙️ 开发

### 开发模式

```bash
npm run dev
```

这会启动 Vite 开发服务器，支持热更新。

### 构建生产版本

```bash
npm run build
```

生成的文件在 `dist` 目录。

### 类型检查

```bash
npm run type-check
```

## 🔐 隐私与安全

- **本地存储**: API Key 和配置存储在本地，不上传到任何服务器
- **域名黑名单**: 支持设置不捕获内容的域名列表
- **数据加密**: 使用浏览器原生加密存储
- **最小权限**: 只请求必需的浏览器权限

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启一个 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙏 致谢

- [React](https://reactjs.org/)
- [Vite](https://vitejs.dev/)
- [CRXJS](https://crxjs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Zustand](https://github.com/pmndrs/zustand)
- [Lucide Icons](https://lucide.dev/)

## 📮 联系方式

- 维护者：[@karsonto](https://github.com/karsonto)
- 项目链接: [https://github.com/karsonto/edge-plugin](https://github.com/karsonto/edge-plugin)

---

⭐ 如果这个项目对您有帮助，请给个 Star！
