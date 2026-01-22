# MCP Browser Tools 参考实现

本目录包含 Chrome MCP Server 的浏览器工具实现代码，可作为其他项目实现类似功能的参考。

## 📋 目录结构

```
mcp-browser-tools-reference/
├── README.md                      # 本文件
├── TOOL_SCHEMAS.md                # 工具 Schema 完整文档
│
├── schemas/
│   └── tool-schemas.ts            # MCP 工具 Schema 定义
│
├── core/
│   ├── base-browser.ts            # 基础工具执行器抽象类
│   ├── tool-handler.ts            # 工具处理器和响应格式
│   └── constants.ts               # 常量配置
│
├── tools/
│   ├── computer.ts                # 统一交互工具 (click/type/scroll/drag等)
│   ├── read-page.ts               # 页面可访问性树读取
│   ├── interaction.ts             # 点击和表单填充工具
│   ├── navigate.ts                # 导航、关闭、切换标签页
│   ├── screenshot.ts              # 截图工具
│   ├── network-request.ts         # 网络请求工具
│   ├── keyboard.ts                # 键盘输入工具
│   └── window.ts                  # 窗口和标签页管理
│
└── inject-scripts/
    ├── accessibility-tree-helper.js  # 可访问性树构建脚本
    ├── click-helper.js               # 点击辅助脚本
    ├── fill-helper.js                # 表单填充脚本
    └── screenshot-helper.js          # 截图辅助脚本
```

## 🛠️ 工具列表

### 浏览器管理
| 工具名 | 描述 |
|--------|------|
| `get_windows_and_tabs` | 获取所有打开的窗口和标签页 |
| `chrome_navigate` | 导航到 URL / 刷新 / 历史前进后退 |
| `chrome_close_tabs` | 关闭标签页 |
| `chrome_switch_tab` | 切换标签页 |

### 页面读取
| 工具名 | 描述 |
|--------|------|
| `chrome_read_page` | 获取页面可访问性树，返回元素 ref |
| `chrome_get_web_content` | 提取页面 HTML/文本内容 |
| `chrome_javascript` | 执行 JavaScript 代码 |
| `chrome_console` | 捕获控制台输出 |

### 页面交互
| 工具名 | 描述 |
|--------|------|
| `chrome_computer` | 统一交互工具 (click/type/scroll/drag/hover/wait等) |
| `chrome_click_element` | 点击元素 |
| `chrome_fill_or_select` | 填写表单 |
| `chrome_keyboard` | 键盘输入 |

### 截图与录制
| 工具名 | 描述 |
|--------|------|
| `chrome_screenshot` | 截图 (全页面/元素/视口) |
| `chrome_gif_recorder` | GIF 录制 |

### 网络
| 工具名 | 描述 |
|--------|------|
| `chrome_network_request` | 发送 HTTP 请求 |
| `chrome_network_capture` | 捕获网络请求 |

### 数据管理
| 工具名 | 描述 |
|--------|------|
| `chrome_history` | 搜索浏览历史 |
| `chrome_bookmark_search` | 搜索书签 |
| `chrome_bookmark_add` | 添加书签 |
| `chrome_bookmark_delete` | 删除书签 |

## 🔑 核心概念

### 1. Element Ref 机制

`chrome_read_page` 返回的元素带有 `ref_*` 标识符，可用于后续交互：

```javascript
// 1. 读取页面获取元素 ref
const page = await chrome_read_page({ filter: "interactive" })
// 返回: ref_1 -> 输入框, ref_2 -> 按钮 ...

// 2. 使用 ref 进行交互
await chrome_fill_or_select({ ref: "ref_1", value: "hello" })
await chrome_click_element({ ref: "ref_2" })
```

### 2. Chrome DevTools Protocol (CDP)

工具使用 CDP 实现底层操作：
- 鼠标事件: `Input.dispatchMouseEvent`
- 键盘事件: `Input.dispatchKeyEvent`
- 截图: `Page.captureScreenshot`
- 页面指标: `Page.getLayoutMetrics`

### 3. Content Script 注入

复杂操作通过注入 Content Script 实现：
- 可访问性树构建
- 元素查找和坐标计算
- 表单填充和事件触发

## 📖 使用方式

1. **参考 Schema 定义**: 查看 `schemas/tool-schemas.ts` 了解参数格式
2. **参考工具实现**: 查看 `tools/` 目录下的具体实现
3. **参考注入脚本**: 查看 `inject-scripts/` 了解 Content Script 实现

## ⚙️ 技术栈

- **Chrome Extension Manifest V3**
- **Chrome DevTools Protocol (CDP)**
- **TypeScript**
- **WXT (WebExtension Tools)**

## 📚 相关文档

- [MCP Protocol](https://modelcontextprotocol.io/)
- [Chrome Extensions API](https://developer.chrome.com/docs/extensions/reference/)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
