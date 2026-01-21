# 🚀 智能助手 插件快速开始指南

## ✅ 构建完成

项目已成功构建！构建输出在 `dist/` 目录。

## 📦 安装到浏览器

### 1. 加载插件

1. 打开 Chrome/Edge 浏览器
2. 访问 `chrome://extensions/`
3. 启用右上角的 **"开发者模式"**
4. 点击 **"加载已解压的扩展程序"**
5. 选择项目中的 `dist` 文件夹

### 2. 配置自定义 API

1. 点击浏览器工具栏的「智能助手」图标（或使用快捷键 `Ctrl+Shift+E`）
2. 切换到 **"设置"** 标签
3. 配置如下：

```
AI 提供商: 自定义
API Key: （留空，如果不需要认证）
模型选择: Qwen3
自定义端点: http://123.192.49.73:8086/v1/chat/completions
```

4. 展开 **"高级设置"**：

```
Temperature: 0.5
Max Tokens: 1024
Top P: 0.8
Repetition Penalty: 1.05
```

5. 配置完成后，关闭设置

### 3. 开始使用

1. 访问任意网页（例如新闻文章、博客等）
2. 点击「智能助手」图标打开侧边栏
3. 插件会自动提取页面内容
4. 使用快捷操作或直接输入问题
5. AI 会基于页面内容回答

## 🎯 快捷操作示例

默认提供 4 个快捷操作：
- 📝 **总结文章** - 用 3-5 个要点总结内容
- 🌐 **翻译成英文** - 将内容翻译成英文
- 💡 **解释概念** - 解释专业术语和关键概念
- ❓ **提取要点** - 提取关键问题和要点

你可以在设置中自定义这些操作！

## ⚠️ 注意事项

### 图标缺失

当前构建为了快速测试，暂时移除了图标引用。如需添加图标：

1. 创建 PNG 图标（16x16, 48x48, 128x128）
2. 放置在 `src/assets/icons/` 目录
3. 取消注释 `manifest.json` 中的图标引用
4. 重新构建

详见：[src/assets/icons/README.md](src/assets/icons/README.md)

### API 端点访问

确保你的网络可以访问：`http://123.192.49.73:8086`

如果无法访问，可能需要：
- 检查网络连接
- 配置代理
- 或使用其他可用的 API 端点

## 🔧 开发模式

如需继续开发：

```bash
# 安装依赖（如果还没安装）
npm install

# 开发模式（支持热更新）
npm run dev

# 类型检查
npm run type-check

# 生产构建
npm run build
```

## 🐛 调试

### 查看日志

**Background Service Worker 日志：**
1. 访问 `chrome://extensions/`
2. 找到「智能助手」插件
3. 点击 "Service Worker" 查看日志

**Content Script 日志：**
- 在网页中打开开发者工具（F12）
- 查看 Console 标签

**Side Panel 日志：**
- 右键点击侧边栏
- 选择 "检查"

### 常见问题

**Q: 无法连接到 API**
- 检查自定义端点是否正确
- 查看 Background Worker 日志中的错误信息
- 确认网络可以访问该端点

**Q: 页面内容提取失败**
- 刷新页面重试
- 检查页面是否为特殊页面（PDF、本地文件等）
- 查看 Content Script 日志

**Q: 快捷操作不工作**
- 确认已配置自定义端点
- 检查提示词模板是否正确
- 确保使用了 `{context}` 占位符

## 📚 更多文档

- **完整文档**: [README.md](README.md)
- **开发指南**: [DEVELOPMENT.md](DEVELOPMENT.md)
- **自定义 API 配置**: [CUSTOM_API_SETUP.md](CUSTOM_API_SETUP.md)
- **图标说明**: [src/assets/icons/README.md](src/assets/icons/README.md)

## 🎉 开始体验

现在就去加载插件，开始使用吧！

如有问题，请查看文档或提交 Issue。
