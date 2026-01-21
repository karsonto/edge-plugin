# Markdown 渲染功能安装说明

## 当前状态

✅ **已完成的工作：**
1. ✅ 已更新 `package.json`，添加 Markdown 相关依赖
2. ✅ 已创建 `MarkdownContent.tsx` 组件
3. ✅ 已修改 `MessageBubble.tsx` 组件支持 Markdown 渲染
4. ✅ 已添加 Markdown 样式优化到 `globals.css`

⚠️ **需要手动操作：**
由于 `node_modules` 目录属于 root 用户，需要手动安装新增的依赖包。

## 安装步骤

### 方法 1：使用 sudo 安装（推荐）

```bash
cd /Users/karson/edage_plugin
sudo npm install
```

输入密码后，npm 将安装以下新增依赖：
- `react-markdown` (^9.0.1)
- `remark-gfm` (^4.0.0)
- `react-syntax-highlighter` (^15.5.0)
- `@types/react-syntax-highlighter` (^15.5.11)

### 方法 2：修复 node_modules 权限（一劳永逸）

如果你希望以后不需要 sudo 来安装包：

```bash
cd /Users/karson/edage_plugin
sudo chown -R karson:staff node_modules
sudo chown karson:staff package-lock.json
npm install
```

这将把 `node_modules` 的所有权改为你的用户。

## 构建和测试

安装完依赖后，运行以下命令构建项目：

```bash
npm run build
```

然后在浏览器中重新加载扩展，测试 Markdown 渲染功能。

## 功能说明

现在 AI 助手的回复将支持：

### 1. 代码块语法高亮
````markdown
```javascript
function hello() {
  console.log("Hello World!");
}
```
````

### 2. 标题层级
```markdown
# 一级标题
## 二级标题
### 三级标题
```

### 3. 列表
```markdown
- 无序列表项 1
- 无序列表项 2

1. 有序列表项 1
2. 有序列表项 2
```

### 4. 表格
```markdown
| 列1 | 列2 | 列3 |
|-----|-----|-----|
| 数据1 | 数据2 | 数据3 |
```

### 5. 引用
```markdown
> 这是一段引用文本
```

### 6. 链接
```markdown
[链接文字](https://example.com)
```

### 7. 强调
```markdown
**粗体文本**
*斜体文本*
```

### 8. 行内代码
```markdown
使用 `code` 表示行内代码
```

## 技术细节

- **react-markdown**: 核心 Markdown 渲染引擎，轻量、安全、React 原生
- **remark-gfm**: 支持 GitHub Flavored Markdown（表格、删除线、任务列表等）
- **react-syntax-highlighter**: 代码块语法高亮，使用 VS Code Dark Plus 主题
- **打包大小影响**: 约 100-150KB (gzipped)

## 故障排除

### 如果构建失败

1. 确认依赖已成功安装：
   ```bash
   npm list react-markdown remark-gfm react-syntax-highlighter
   ```

2. 如果依赖缺失，尝试：
   ```bash
   sudo npm install
   ```

3. 如果仍有问题，清理并重新安装：
   ```bash
   sudo rm -rf node_modules package-lock.json
   sudo npm install
   sudo chown -R karson:staff node_modules package-lock.json
   ```

## 预期效果

成功安装后，AI 的回复将以美观的格式显示：
- ✅ 代码块有语法高亮（JavaScript、Python、TypeScript 等）
- ✅ 标题有层级样式
- ✅ 表格自动排版，带斑马纹
- ✅ 列表自动缩进
- ✅ 引用有左侧边框和浅色背景
- ✅ 链接可点击，在新标签页打开

## 需要帮助？

如果遇到问题，请检查：
1. Node.js 版本是否兼容 (建议 18.x 或更高)
2. npm 版本是否最新
3. 系统权限是否正确
