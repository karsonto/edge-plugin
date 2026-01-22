# MCP Browser Tools Schema 参考文档

本文档包含所有浏览器工具的完整 Schema 定义，供 AI 模型参考调用。

---

## 📊 浏览器管理

### `get_windows_and_tabs`

获取所有打开的浏览器窗口和标签页。

**参数**: 无

**返回示例**:
```json
{
  "windowCount": 2,
  "tabCount": 5,
  "windows": [
    {
      "windowId": 123,
      "tabs": [
        { "tabId": 456, "url": "https://example.com", "title": "Example", "active": true }
      ]
    }
  ]
}
```

---

### `chrome_navigate`

导航到 URL、刷新页面、或浏览器历史前进/后退。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `url` | string | 否 | URL 或特殊值 "back"/"forward" |
| `newWindow` | boolean | 否 | 在新窗口打开 (默认: false) |
| `tabId` | number | 否 | 目标标签页 ID |
| `windowId` | number | 否 | 目标窗口 ID |
| `background` | boolean | 否 | 不激活标签页 (默认: false) |
| `width` | number | 否 | 窗口宽度 (默认: 1280) |
| `height` | number | 否 | 窗口高度 (默认: 720) |
| `refresh` | boolean | 否 | 刷新当前页 (默认: false) |

**示例**:
```json
{ "url": "https://example.com", "newWindow": true }
{ "refresh": true }
{ "url": "back" }
```

---

### `chrome_close_tabs`

关闭标签页。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `tabIds` | number[] | 否 | 要关闭的标签页 ID 数组 |
| `url` | string | 否 | 关闭匹配此 URL 的标签页 |

---

### `chrome_switch_tab`

切换到指定标签页。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `tabId` | number | ✅ | 目标标签页 ID |
| `windowId` | number | 否 | 窗口 ID |

---

## 📖 页面读取

### `chrome_read_page`

获取页面的可访问性树，返回带 `ref_*` 标识符的元素列表。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `filter` | string | 否 | `"interactive"` 只返回交互元素 |
| `depth` | number | 否 | 最大 DOM 深度 |
| `refId` | string | 否 | 聚焦于特定 ref 的子树 |
| `tabId` | number | 否 | 目标标签页 ID |
| `windowId` | number | 否 | 目标窗口 ID |

**返回示例**:
```json
{
  "success": true,
  "pageContent": "- button ref_1 \"Submit\"\n- input ref_2 placeholder=\"Email\"",
  "viewport": { "width": 1280, "height": 720, "dpr": 2 },
  "refMapCount": 15
}
```

**使用技巧**: 返回的 `ref_*` 可用于 `chrome_click_element`、`chrome_fill_or_select`、`chrome_computer` 等工具。

---

### `chrome_get_web_content`

提取网页内容。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `url` | string | 否 | URL (不提供则用当前标签页) |
| `tabId` | number | 否 | 目标标签页 ID |
| `htmlContent` | boolean | 否 | 获取 HTML (默认: false) |
| `textContent` | boolean | 否 | 获取文本 (默认: true) |
| `selector` | string | 否 | CSS 选择器限定范围 |

---

### `chrome_javascript`

在浏览器中执行 JavaScript 代码。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `code` | string | ✅ | JavaScript 代码 |
| `tabId` | number | 否 | 目标标签页 ID |
| `timeoutMs` | number | 否 | 超时 (默认: 15000) |
| `maxOutputBytes` | number | 否 | 最大输出大小 (默认: 51200) |

**示例**:
```json
{ "code": "return document.title" }
{ "code": "await fetch('/api/data').then(r => r.json())" }
```

---

### `chrome_console`

捕获浏览器控制台输出。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `tabId` | number | 否 | 目标标签页 ID |
| `mode` | string | 否 | `"snapshot"` 或 `"buffer"` |
| `includeExceptions` | boolean | 否 | 包含异常 (默认: true) |
| `onlyErrors` | boolean | 否 | 只返回错误 (默认: false) |
| `maxMessages` | number | 否 | 最大消息数 (默认: 100) |

---

## 🎯 页面交互

### `chrome_computer` ⭐ 核心工具

统一交互工具，支持多种操作类型。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `action` | string | ✅ | 操作类型 (见下表) |
| `tabId` | number | 否 | 目标标签页 ID |
| `ref` | string | 否 | 元素 ref (来自 read_page) |
| `coordinates` | object | 否 | `{ x, y }` 坐标 |
| `text` | string | 否 | 输入文本或按键 |
| `value` | any | 否 | fill 的值 |
| `selector` | string | 否 | CSS 选择器 |
| `scrollDirection` | string | 否 | `up/down/left/right` |
| `scrollAmount` | number | 否 | 滚动量 1-10 |
| `duration` | number | 否 | wait 秒数 |
| `modifiers` | object | 否 | 修饰键 `{ altKey, ctrlKey, metaKey, shiftKey }` |

**操作类型 (action)**:
| Action | 描述 | 必需参数 |
|--------|------|----------|
| `left_click` | 左键单击 | ref/selector/coordinates |
| `right_click` | 右键单击 | ref/selector/coordinates |
| `double_click` | 双击 | ref/selector/coordinates |
| `triple_click` | 三击 | ref/selector/coordinates |
| `left_click_drag` | 拖拽 | startRef/startCoordinates + ref/coordinates |
| `scroll` | 滚动 | ref/coordinates + scrollDirection |
| `scroll_to` | 滚动到元素 | ref |
| `type` | 输入文本 | text |
| `key` | 按键/快捷键 | text (如 "Enter", "cmd+a") |
| `fill` | 填表单 | ref/selector + value |
| `fill_form` | 批量填表单 | elements: [{ref, value}] |
| `hover` | 悬停 | ref/selector/coordinates |
| `wait` | 等待 | duration (秒) 或 text (等待文本出现) |
| `resize_page` | 调整视口 | width, height |
| `zoom` | 截取区域 | region: {x0,y0,x1,y1} |
| `screenshot` | 截图 | (无) |

**示例**:
```json
{ "action": "left_click", "ref": "ref_5" }
{ "action": "type", "text": "Hello World" }
{ "action": "key", "text": "cmd+a Backspace" }
{ "action": "fill", "ref": "ref_3", "value": "user@example.com" }
{ "action": "scroll", "coordinates": {"x": 500, "y": 300}, "scrollDirection": "down" }
{ "action": "wait", "duration": 2 }
{ "action": "wait", "text": "Loading complete", "timeout": 10000 }
```

---

### `chrome_click_element`

点击元素 (比 chrome_computer 更专注于点击场景)。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `ref` | string | 否 | 元素 ref |
| `selector` | string | 否 | CSS 选择器或 XPath |
| `selectorType` | string | 否 | `"css"` 或 `"xpath"` |
| `coordinates` | object | 否 | `{ x, y }` |
| `double` | boolean | 否 | 双击 |
| `button` | string | 否 | `"left"/"right"/"middle"` |
| `modifiers` | object | 否 | 修饰键 |
| `waitForNavigation` | boolean | 否 | 等待导航完成 |
| `timeout` | number | 否 | 超时毫秒 |
| `tabId` | number | 否 | 目标标签页 |
| `frameId` | number | 否 | iframe frame ID |

---

### `chrome_fill_or_select`

填写表单或选择选项。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `ref` | string | 否 | 元素 ref |
| `selector` | string | 否 | CSS 选择器 |
| `selectorType` | string | 否 | `"css"` 或 `"xpath"` |
| `value` | string/number/boolean | ✅ | 填入的值 |
| `tabId` | number | 否 | 目标标签页 |
| `frameId` | number | 否 | iframe frame ID |

---

### `chrome_keyboard`

模拟键盘输入。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `keys` | string | ✅ | 按键或组合键 (如 "Enter", "Ctrl+C") |
| `selector` | string | 否 | 目标元素选择器 |
| `delay` | number | 否 | 按键间隔毫秒 (默认: 50) |
| `tabId` | number | 否 | 目标标签页 |

---

### `chrome_request_element_selection`

请求用户手动选择元素 (人机协作)。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `requests` | array | ✅ | 选择请求列表 `[{id?, name, description?}]` |
| `timeoutMs` | number | 否 | 超时 (默认: 180000) |
| `tabId` | number | 否 | 目标标签页 |

---

## 📸 截图与录制

### `chrome_screenshot`

截取页面截图。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `name` | string | 否 | 文件名 |
| `selector` | string | 否 | 元素选择器 (截取元素) |
| `tabId` | number | 否 | 目标标签页 |
| `fullPage` | boolean | 否 | 全页面截图 (默认: false) |
| `storeBase64` | boolean | 否 | 返回 base64 (默认: false) |
| `savePng` | boolean | 否 | 保存 PNG 文件 (默认: true) |
| `width` | number | 否 | 输出宽度 |
| `height` | number | 否 | 输出高度 |

---

### `chrome_gif_recorder`

录制浏览器操作为 GIF。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `action` | string | ✅ | `"start"/"auto_start"/"stop"/"capture"/"status"/"clear"/"export"` |
| `tabId` | number | 否 | 目标标签页 |
| `fps` | number | 否 | 帧率 1-30 (默认: 5) |
| `durationMs` | number | 否 | 最大时长毫秒 |
| `maxFrames` | number | 否 | 最大帧数 |
| `width` | number | 否 | 输出宽度 |
| `height` | number | 否 | 输出高度 |

---

## 🌐 网络

### `chrome_network_request`

发送 HTTP 请求 (携带浏览器 cookie)。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `url` | string | ✅ | 请求 URL |
| `method` | string | 否 | HTTP 方法 (默认: GET) |
| `headers` | object | 否 | 请求头 |
| `body` | string | 否 | 请求体 |
| `timeout` | number | 否 | 超时毫秒 (默认: 30000) |
| `formData` | object | 否 | multipart/form-data |

---

### `chrome_network_capture`

捕获网络请求。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `action` | string | ✅ | `"start"` 或 `"stop"` |
| `needResponseBody` | boolean | 否 | 捕获响应体 (默认: false) |
| `url` | string | 否 | 导航并捕获的 URL |
| `maxCaptureTime` | number | 否 | 最大捕获时间毫秒 |
| `inactivityTimeout` | number | 否 | 无活动停止时间 |
| `includeStatic` | boolean | 否 | 包含静态资源 (默认: false) |

---

## 📚 数据管理

### `chrome_history`

搜索浏览历史。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `text` | string | 否 | 搜索文本 |
| `startTime` | string | 否 | 开始时间 (ISO 或 "1 day ago") |
| `endTime` | string | 否 | 结束时间 |
| `maxResults` | number | 否 | 最大结果数 (默认: 100) |
| `excludeCurrentTabs` | boolean | 否 | 排除当前打开的标签页 |

---

### `chrome_bookmark_search`

搜索书签。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `query` | string | 否 | 搜索关键词 |
| `maxResults` | number | 否 | 最大结果数 (默认: 50) |
| `folderPath` | string | 否 | 限定文件夹路径 |

---

### `chrome_bookmark_add`

添加书签。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `url` | string | 否 | URL (默认: 当前页) |
| `title` | string | 否 | 标题 (默认: 页面标题) |
| `parentId` | string | 否 | 父文件夹 ID 或路径 |
| `createFolder` | boolean | 否 | 自动创建文件夹 |

---

### `chrome_bookmark_delete`

删除书签。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `bookmarkId` | string | 否 | 书签 ID |
| `url` | string | 否 | 书签 URL |

---

## 📁 文件与对话框

### `chrome_upload_file`

上传文件到表单。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `selector` | string | ✅ | 文件输入框选择器 |
| `filePath` | string | 否 | 本地文件路径 |
| `fileUrl` | string | 否 | 文件 URL |
| `base64Data` | string | 否 | Base64 文件数据 |
| `fileName` | string | 否 | 文件名 |

---

### `chrome_handle_dialog`

处理 JavaScript 对话框 (alert/confirm/prompt)。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `action` | string | ✅ | `"accept"` 或 `"dismiss"` |
| `promptText` | string | 否 | prompt 对话框的输入文本 |

---

### `chrome_handle_download`

等待下载完成。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `filenameContains` | string | 否 | 文件名过滤 |
| `timeoutMs` | number | 否 | 超时 (默认: 60000) |
| `waitForComplete` | boolean | 否 | 等待完成 (默认: true) |

---

## ⚡ 性能分析

### `performance_start_trace`

开始性能追踪。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `reload` | boolean | 否 | 重新加载页面 |
| `autoStop` | boolean | 否 | 自动停止 |
| `durationMs` | number | 否 | 自动停止时长 (默认: 5000) |

---

### `performance_stop_trace`

停止性能追踪。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `saveToDownloads` | boolean | 否 | 保存到下载 (默认: true) |
| `filenamePrefix` | string | 否 | 文件名前缀 |

---

### `performance_analyze_insight`

分析追踪结果。

**参数**:
| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `insightName` | string | 否 | 分析类型 |
| `timeoutMs` | number | 否 | 分析超时 (默认: 60000) |

---

## 🔄 典型使用流程

```javascript
// 1. 导航到页面
await chrome_navigate({ url: "https://example.com" })

// 2. 读取页面结构
const page = await chrome_read_page({ filter: "interactive" })
// 返回元素 refs: ref_1, ref_2, ref_3...

// 3. 填写表单
await chrome_fill_or_select({ ref: "ref_1", value: "user@example.com" })
await chrome_fill_or_select({ ref: "ref_2", value: "password123" })

// 4. 点击登录按钮
await chrome_click_element({ ref: "ref_3" })

// 5. 等待页面加载
await chrome_computer({ action: "wait", text: "Welcome", timeout: 5000 })

// 6. 截图确认结果
await chrome_screenshot({ storeBase64: true })
```
