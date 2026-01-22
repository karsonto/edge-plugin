/**
 * MCP Browser Tools Schema Definitions
 * 
 * 所有浏览器工具的 MCP Schema 定义
 * 基于 @modelcontextprotocol/sdk/types.js 的 Tool 类型
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * 工具名称常量
 */
export const TOOL_NAMES = {
  BROWSER: {
    GET_WINDOWS_AND_TABS: 'get_windows_and_tabs',
    SEARCH_TABS_CONTENT: 'search_tabs_content',
    NAVIGATE: 'chrome_navigate',
    SCREENSHOT: 'chrome_screenshot',
    CLOSE_TABS: 'chrome_close_tabs',
    SWITCH_TAB: 'chrome_switch_tab',
    WEB_FETCHER: 'chrome_get_web_content',
    CLICK: 'chrome_click_element',
    FILL: 'chrome_fill_or_select',
    REQUEST_ELEMENT_SELECTION: 'chrome_request_element_selection',
    GET_INTERACTIVE_ELEMENTS: 'chrome_get_interactive_elements',
    NETWORK_CAPTURE: 'chrome_network_capture',
    NETWORK_REQUEST: 'chrome_network_request',
    KEYBOARD: 'chrome_keyboard',
    HISTORY: 'chrome_history',
    BOOKMARK_SEARCH: 'chrome_bookmark_search',
    BOOKMARK_ADD: 'chrome_bookmark_add',
    BOOKMARK_DELETE: 'chrome_bookmark_delete',
    JAVASCRIPT: 'chrome_javascript',
    CONSOLE: 'chrome_console',
    FILE_UPLOAD: 'chrome_upload_file',
    READ_PAGE: 'chrome_read_page',
    COMPUTER: 'chrome_computer',
    HANDLE_DIALOG: 'chrome_handle_dialog',
    HANDLE_DOWNLOAD: 'chrome_handle_download',
    GIF_RECORDER: 'chrome_gif_recorder',
    PERFORMANCE_START_TRACE: 'performance_start_trace',
    PERFORMANCE_STOP_TRACE: 'performance_stop_trace',
    PERFORMANCE_ANALYZE_INSIGHT: 'performance_analyze_insight',
  },
};

/**
 * 所有工具的 Schema 定义
 */
export const TOOL_SCHEMAS: Tool[] = [
  // ============================================
  // 浏览器管理
  // ============================================
  {
    name: TOOL_NAMES.BROWSER.GET_WINDOWS_AND_TABS,
    description: 'Get all currently open browser windows and tabs',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.NAVIGATE,
    description:
      'Navigate to a URL, refresh the current tab, or navigate browser history (back/forward)',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'URL to navigate to. Special values: "back" or "forward" to navigate browser history.',
        },
        newWindow: {
          type: 'boolean',
          description: 'Create a new window. Defaults to false',
        },
        tabId: {
          type: 'number',
          description: 'Target an existing tab by ID',
        },
        windowId: {
          type: 'number',
          description: 'Target an existing window by ID',
        },
        background: {
          type: 'boolean',
          description: 'Do not activate the tab or focus the window. Default: false',
        },
        width: {
          type: 'number',
          description: 'Window width in pixels (default: 1280)',
        },
        height: {
          type: 'number',
          description: 'Window height in pixels (default: 720)',
        },
        refresh: {
          type: 'boolean',
          description: 'Refresh the current active tab. Defaults to false',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.CLOSE_TABS,
    description: 'Close one or more browser tabs',
    inputSchema: {
      type: 'object',
      properties: {
        tabIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of tab IDs to close',
        },
        url: {
          type: 'string',
          description: 'Close tabs matching this URL',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.SWITCH_TAB,
    description: 'Switch to a specific browser tab',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The ID of the tab to switch to',
        },
        windowId: {
          type: 'number',
          description: 'The ID of the window where the tab is located',
        },
      },
      required: ['tabId'],
    },
  },

  // ============================================
  // 页面读取
  // ============================================
  {
    name: TOOL_NAMES.BROWSER.READ_PAGE,
    description:
      'Get an accessibility tree representation of visible elements on the page. Returns elements with ref_* identifiers for use in interaction tools.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description: 'Filter elements: "interactive" for buttons/links/inputs only',
        },
        depth: {
          type: 'number',
          description: 'Maximum DOM depth to traverse',
        },
        refId: {
          type: 'string',
          description: 'Focus on the subtree rooted at this element refId',
        },
        tabId: {
          type: 'number',
          description: 'Target an existing tab by ID (default: active tab)',
        },
        windowId: {
          type: 'number',
          description: 'Target window ID to pick active tab when tabId is omitted',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.WEB_FETCHER,
    description: 'Fetch content from a web page',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to fetch content from. If not provided, uses the current active tab',
        },
        tabId: {
          type: 'number',
          description: 'Target an existing tab by ID (default: active tab)',
        },
        htmlContent: {
          type: 'boolean',
          description: 'Get the visible HTML content of the page (default: false)',
        },
        textContent: {
          type: 'boolean',
          description: 'Get the visible text content of the page (default: true)',
        },
        selector: {
          type: 'string',
          description: 'CSS selector to get content from a specific element',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.JAVASCRIPT,
    description:
      'Execute JavaScript code in a browser tab and return the result',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript code to execute. Supports top-level await.',
        },
        tabId: {
          type: 'number',
          description: 'Target tab ID. If omitted, uses the current active tab',
        },
        timeoutMs: {
          type: 'number',
          description: 'Execution timeout in milliseconds (default: 15000)',
        },
        maxOutputBytes: {
          type: 'number',
          description: 'Maximum output size in bytes (default: 51200)',
        },
      },
      required: ['code'],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.CONSOLE,
    description: 'Capture console output from a browser tab',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Target an existing tab by ID (default: active tab)',
        },
        mode: {
          type: 'string',
          enum: ['snapshot', 'buffer'],
          description: 'Console capture mode',
        },
        includeExceptions: {
          type: 'boolean',
          description: 'Include uncaught exceptions (default: true)',
        },
        maxMessages: {
          type: 'number',
          description: 'Maximum number of console messages (default: 100)',
        },
        onlyErrors: {
          type: 'boolean',
          description: 'Only return error-level messages (default: false)',
        },
      },
      required: [],
    },
  },

  // ============================================
  // 页面交互
  // ============================================
  {
    name: TOOL_NAMES.BROWSER.COMPUTER,
    description:
      "Use a mouse and keyboard to interact with a web browser, and take screenshots. Unified interaction tool supporting click, type, scroll, drag, hover, wait, fill, and screenshot actions.",
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Target tab ID (default: active tab)' },
        action: {
          type: 'string',
          description:
            'Action to perform: left_click | right_click | double_click | triple_click | left_click_drag | scroll | scroll_to | type | key | fill | fill_form | hover | wait | resize_page | zoom | screenshot',
        },
        ref: {
          type: 'string',
          description: 'Element ref from chrome_read_page. For click/scroll/key/type and drag end.',
        },
        coordinates: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'X coordinate' },
            y: { type: 'number', description: 'Y coordinate' },
          },
          description: 'Coordinates for actions. Required for click/scroll and drag end.',
        },
        startCoordinates: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' } },
          description: 'Starting coordinates for drag action',
        },
        startRef: {
          type: 'string',
          description: 'Drag start ref from chrome_read_page',
        },
        scrollDirection: {
          type: 'string',
          description: 'Scroll direction: up | down | left | right',
        },
        scrollAmount: {
          type: 'number',
          description: 'Scroll ticks (1-10), default 3',
        },
        text: {
          type: 'string',
          description: 'Text to type (action=type) or keys/chords (action=key, e.g. "Backspace Enter" or "cmd+a")',
        },
        repeat: {
          type: 'number',
          description: 'For action=key: number of times to repeat (1-100, default 1)',
        },
        modifiers: {
          type: 'object',
          description: 'Modifier keys for click actions',
          properties: {
            altKey: { type: 'boolean' },
            ctrlKey: { type: 'boolean' },
            metaKey: { type: 'boolean' },
            shiftKey: { type: 'boolean' },
          },
        },
        selector: {
          type: 'string',
          description: 'CSS selector for fill (alternative to ref)',
        },
        value: {
          oneOf: [{ type: 'string' }, { type: 'boolean' }, { type: 'number' }],
          description: 'Value to set for action=fill',
        },
        elements: {
          type: 'array',
          description: 'For action=fill_form: list of elements to fill',
          items: {
            type: 'object',
            properties: {
              ref: { type: 'string', description: 'Element ref from chrome_read_page' },
              value: { type: 'string', description: 'Value to set' },
            },
            required: ['ref', 'value'],
          },
        },
        width: { type: 'number', description: 'For action=resize_page: viewport width' },
        height: { type: 'number', description: 'For action=resize_page: viewport height' },
        duration: {
          type: 'number',
          description: 'Seconds to wait for action=wait (max 30s)',
        },
        timeout: {
          type: 'number',
          description: 'For action=wait with text: timeout in milliseconds (default 10000)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.CLICK,
    description:
      'Click on an element. Supports CSS selector, XPath, element ref, or viewport coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector or XPath for the element to click',
        },
        selectorType: {
          type: 'string',
          enum: ['css', 'xpath'],
          description: 'Type of selector (default: "css")',
        },
        ref: {
          type: 'string',
          description: 'Element ref from chrome_read_page (takes precedence over selector)',
        },
        coordinates: {
          type: 'object',
          description: 'Viewport coordinates to click at',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
          required: ['x', 'y'],
        },
        double: {
          type: 'boolean',
          description: 'Perform double click (default: false)',
        },
        button: {
          type: 'string',
          enum: ['left', 'right', 'middle'],
          description: 'Mouse button (default: "left")',
        },
        modifiers: {
          type: 'object',
          description: 'Modifier keys to hold during click',
          properties: {
            altKey: { type: 'boolean' },
            ctrlKey: { type: 'boolean' },
            metaKey: { type: 'boolean' },
            shiftKey: { type: 'boolean' },
          },
        },
        waitForNavigation: {
          type: 'boolean',
          description: 'Wait for navigation to complete (default: false)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 5000)',
        },
        tabId: { type: 'number', description: 'Target tab ID' },
        frameId: { type: 'number', description: 'Target frame ID for iframe support' },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.FILL,
    description:
      'Fill or select a form element. Supports input, textarea, select, checkbox, and radio.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector or XPath for the form element',
        },
        selectorType: {
          type: 'string',
          enum: ['css', 'xpath'],
          description: 'Type of selector (default: "css")',
        },
        ref: {
          type: 'string',
          description: 'Element ref from chrome_read_page (takes precedence over selector)',
        },
        value: {
          type: ['string', 'number', 'boolean'],
          description: 'Value to fill. String for text inputs, boolean for checkboxes/radios.',
        },
        tabId: { type: 'number', description: 'Target tab ID' },
        frameId: { type: 'number', description: 'Target frame ID for iframe support' },
      },
      required: ['value'],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.KEYBOARD,
    description:
      'Simulate keyboard input. Supports single keys, key combinations, and text input.',
    inputSchema: {
      type: 'object',
      properties: {
        keys: {
          type: 'string',
          description: 'Keys or key combinations. Examples: "Enter", "Ctrl+C", "Hello World"',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for target element',
        },
        delay: {
          type: 'number',
          description: 'Delay between keystrokes in milliseconds (default: 50)',
        },
        tabId: { type: 'number', description: 'Target tab ID' },
        frameId: { type: 'number', description: 'Target frame ID' },
      },
      required: ['keys'],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.REQUEST_ELEMENT_SELECTION,
    description:
      'Request the user to manually select elements. Use as fallback when you cannot locate elements.',
    inputSchema: {
      type: 'object',
      properties: {
        requests: {
          type: 'array',
          description: 'List of element selection requests',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Optional request id for correlation' },
              name: { type: 'string', description: 'Short label describing what to select' },
              description: { type: 'string', description: 'Optional longer instruction' },
            },
            required: ['name'],
          },
        },
        timeoutMs: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 180000)',
        },
        tabId: { type: 'number', description: 'Target tab ID' },
      },
      required: ['requests'],
    },
  },

  // ============================================
  // 截图与录制
  // ============================================
  {
    name: TOOL_NAMES.BROWSER.SCREENSHOT,
    description: 'Take a screenshot of the current page or a specific element',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Screenshot filename' },
        selector: { type: 'string', description: 'CSS selector for element to screenshot' },
        tabId: { type: 'number', description: 'Target tab ID' },
        fullPage: { type: 'boolean', description: 'Capture full page (default: false)' },
        storeBase64: { type: 'boolean', description: 'Return base64 data (default: false)' },
        savePng: { type: 'boolean', description: 'Save as PNG file (default: true)' },
        width: { type: 'number', description: 'Output width in pixels' },
        height: { type: 'number', description: 'Output height in pixels' },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.GIF_RECORDER,
    description: 'Record browser tab activity as an animated GIF',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'stop', 'status', 'auto_start', 'capture', 'clear', 'export'],
          description: 'Action to perform',
        },
        tabId: { type: 'number', description: 'Target tab ID' },
        fps: { type: 'number', description: 'Frames per second (1-30, default: 5)' },
        durationMs: { type: 'number', description: 'Maximum recording duration in milliseconds' },
        maxFrames: { type: 'number', description: 'Maximum number of frames' },
        width: { type: 'number', description: 'Output GIF width' },
        height: { type: 'number', description: 'Output GIF height' },
      },
      required: ['action'],
    },
  },

  // ============================================
  // 网络
  // ============================================
  {
    name: TOOL_NAMES.BROWSER.NETWORK_REQUEST,
    description: 'Send a network request from the browser with cookies and browser context',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to send the request to' },
        method: { type: 'string', description: 'HTTP method (default: GET)' },
        headers: { type: 'object', description: 'Headers to include' },
        body: { type: 'string', description: 'Request body' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
        formData: {
          type: 'object',
          description: 'Multipart/form-data descriptor for file uploads',
        },
      },
      required: ['url'],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.NETWORK_CAPTURE,
    description: 'Capture network requests. Use action="start" to begin, action="stop" to end.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'stop'],
          description: 'Action: "start" begins capture, "stop" ends and returns results',
        },
        needResponseBody: {
          type: 'boolean',
          description: 'Capture response body using Debugger API (default: false)',
        },
        url: { type: 'string', description: 'URL to navigate to and capture' },
        maxCaptureTime: { type: 'number', description: 'Maximum capture time in milliseconds' },
        inactivityTimeout: { type: 'number', description: 'Stop after inactivity in milliseconds' },
        includeStatic: { type: 'boolean', description: 'Include static resources (default: false)' },
      },
      required: ['action'],
    },
  },

  // ============================================
  // 数据管理
  // ============================================
  {
    name: TOOL_NAMES.BROWSER.HISTORY,
    description: 'Retrieve and search browsing history',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Search text in history URLs and titles' },
        startTime: { type: 'string', description: 'Start time (ISO format or "1 day ago")' },
        endTime: { type: 'string', description: 'End time' },
        maxResults: { type: 'number', description: 'Maximum results (default: 100)' },
        excludeCurrentTabs: { type: 'boolean', description: 'Exclude currently open tabs' },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.BOOKMARK_SEARCH,
    description: 'Search Chrome bookmarks',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords' },
        maxResults: { type: 'number', description: 'Maximum results (default: 50)' },
        folderPath: { type: 'string', description: 'Search within specific folder' },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.BOOKMARK_ADD,
    description: 'Add a new bookmark',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to bookmark (default: current tab)' },
        title: { type: 'string', description: 'Bookmark title (default: page title)' },
        parentId: { type: 'string', description: 'Parent folder ID or path' },
        createFolder: { type: 'boolean', description: 'Create folder if not exists' },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.BOOKMARK_DELETE,
    description: 'Delete a bookmark',
    inputSchema: {
      type: 'object',
      properties: {
        bookmarkId: { type: 'string', description: 'Bookmark ID to delete' },
        url: { type: 'string', description: 'URL of the bookmark to delete' },
      },
      required: [],
    },
  },

  // ============================================
  // 文件与对话框
  // ============================================
  {
    name: TOOL_NAMES.BROWSER.FILE_UPLOAD,
    description: 'Upload files to web forms with file input elements',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Target tab ID (default: active tab)' },
        selector: { type: 'string', description: 'CSS selector for the file input element' },
        filePath: { type: 'string', description: 'Local file path to upload' },
        fileUrl: { type: 'string', description: 'URL to download file from before uploading' },
        base64Data: { type: 'string', description: 'Base64 encoded file data to upload' },
        fileName: { type: 'string', description: 'Optional filename' },
      },
      required: ['selector'],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.HANDLE_DIALOG,
    description: 'Handle JavaScript dialogs (alert/confirm/prompt)',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'accept | dismiss' },
        promptText: { type: 'string', description: 'Optional prompt text when accepting' },
      },
      required: ['action'],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.HANDLE_DOWNLOAD,
    description: 'Wait for a browser download and return details',
    inputSchema: {
      type: 'object',
      properties: {
        filenameContains: { type: 'string', description: 'Filter by substring in filename' },
        timeoutMs: { type: 'number', description: 'Timeout in ms (default 60000)' },
        waitForComplete: { type: 'boolean', description: 'Wait until completed (default true)' },
      },
      required: [],
    },
  },

  // ============================================
  // 性能分析
  // ============================================
  {
    name: TOOL_NAMES.BROWSER.PERFORMANCE_START_TRACE,
    description: 'Start a performance trace recording on the selected page',
    inputSchema: {
      type: 'object',
      properties: {
        reload: { type: 'boolean', description: 'Reload the page after starting trace' },
        autoStop: { type: 'boolean', description: 'Automatically stop the trace' },
        durationMs: { type: 'number', description: 'Auto-stop duration in milliseconds' },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.PERFORMANCE_STOP_TRACE,
    description: 'Stop the active performance trace recording',
    inputSchema: {
      type: 'object',
      properties: {
        saveToDownloads: { type: 'boolean', description: 'Save trace as JSON file' },
        filenamePrefix: { type: 'string', description: 'Filename prefix for the trace' },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.PERFORMANCE_ANALYZE_INSIGHT,
    description: 'Analyze the last recorded trace',
    inputSchema: {
      type: 'object',
      properties: {
        insightName: { type: 'string', description: 'Insight name for analysis' },
        timeoutMs: { type: 'number', description: 'Timeout for analysis (default 60000)' },
      },
      required: [],
    },
  },
];

export default TOOL_SCHEMAS;
