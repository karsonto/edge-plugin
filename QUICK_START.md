# 快速开始

这份文档面向首次运行当前仓库，内容只覆盖已经存在的实现。

## 1. 安装依赖

```bash
npm install
```

## 2. 构建

```bash
npm run build
```

构建完成后，产物位于 `dist/`。

## 3. 加载到 Chrome / Edge

1. 打开 `chrome://extensions/`
2. 启用“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择项目根目录下的 `dist/`

## 4. 基础配置

打开侧边栏的“设置”页，选择一种 AI 接入方式。

### 方案 A：OpenAI 官方

- 服务类型：`OpenAI 官方`
- API Key：填写有效的 OpenAI Key
- 模型：从下拉中选择

### 方案 B：OpenAI-compatible / 自定义端点

- 服务类型：`OpenAI-compatible / 自定义端点`
- API Key：可选
- 模型：填写或选择模型名，例如 `qwen3`
- 兼容端点：例如 `http://localhost:8080/v1/chat/completions`

更多说明见 [CUSTOM_API_SETUP.md](/Users/karson/edage_plugin/CUSTOM_API_SETUP.md:1)。

## 5. 开始使用

### 网页对话

1. 打开任意网页
2. 点击扩展图标，或使用快捷键 `Ctrl+Shift+E`
3. 侧边栏会尝试抓取当前页面内容
4. 直接输入问题或点击快捷操作

### 文件对话

可以直接把这些文件拖到侧边栏中：

- `txt`
- `pdf`
- `docx`
- `pptx`

解析完成后，文件内容会自动并入后续对话上下文。

### 页面读取工具

聊天页底部有“页面读取工具”开关：

- 关闭时：按普通页面问答模式工作
- 开启时：Agent 可以读取页面结构、执行低风险交互、截图

## 6. 常用命令

```bash
npm run dev
npm run build
npm run type-check
```

## 7. 调试

- Side Panel：
  在侧边栏界面右键，选择“检查”
- Background：
  到 `chrome://extensions/` 打开当前扩展的 Service Worker 控制台
- Content Script：
  在目标网页打开 DevTools，看 Console

## 8. 先读哪些文档

如果你是开发者，建议先读：

1. [PROJECT_CONTEXT.md](/Users/karson/edage_plugin/PROJECT_CONTEXT.md:1)
2. [DEVELOPMENT.md](/Users/karson/edage_plugin/DEVELOPMENT.md:1)
3. [README.md](/Users/karson/edage_plugin/README.md:1)
