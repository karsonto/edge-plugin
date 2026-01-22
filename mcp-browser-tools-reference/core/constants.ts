/**
 * Chrome Extension Constants - 常量配置
 * 集中管理配置值和常量
 */

// 超时和延迟配置 (毫秒)
export const TIMEOUTS = {
  DEFAULT_WAIT: 1000,           // 默认等待时间
  NETWORK_CAPTURE_MAX: 30000,   // 网络捕获最大时间
  NETWORK_CAPTURE_IDLE: 3000,   // 网络捕获空闲超时
  SCREENSHOT_DELAY: 100,        // 截图延迟
  KEYBOARD_DELAY: 50,           // 键盘输入延迟
  CLICK_DELAY: 100,             // 点击延迟
} as const;

// 限制阈值
export const LIMITS = {
  MAX_NETWORK_REQUESTS: 100,    // 最大网络请求数
  MAX_SEARCH_RESULTS: 50,       // 最大搜索结果数
  MAX_BOOKMARK_RESULTS: 100,    // 最大书签结果数
  MAX_HISTORY_RESULTS: 100,     // 最大历史记录数
  SIMILARITY_THRESHOLD: 0.1,    // 相似度阈值
  VECTOR_DIMENSIONS: 384,       // 向量维度
} as const;

// 错误消息
export const ERROR_MESSAGES = {
  NATIVE_CONNECTION_FAILED: 'Failed to connect to native host',
  NATIVE_DISCONNECTED: 'Native connection disconnected',
  SERVER_STATUS_LOAD_FAILED: 'Failed to load server status',
  SERVER_STATUS_SAVE_FAILED: 'Failed to save server status',
  TOOL_EXECUTION_FAILED: 'Tool execution failed',
  INVALID_PARAMETERS: 'Invalid parameters provided',
  PERMISSION_DENIED: 'Permission denied',
  TAB_NOT_FOUND: 'Tab not found',
  ELEMENT_NOT_FOUND: 'Element not found',
  NETWORK_ERROR: 'Network error occurred',
} as const;

// 成功消息
export const SUCCESS_MESSAGES = {
  TOOL_EXECUTED: 'Tool executed successfully',
  CONNECTION_ESTABLISHED: 'Connection established',
  SERVER_STARTED: 'Server started successfully',
  SERVER_STOPPED: 'Server stopped successfully',
} as const;

// 文件类型配置
export const FILE_TYPES = {
  STATIC_EXTENSIONS: [
    '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', 
    '.svg', '.ico', '.woff', '.woff2', '.ttf',
  ],
  IMAGE_FORMATS: ['png', 'jpeg', 'webp'] as const,
} as const;

// 网络过滤配置
export const NETWORK_FILTERS = {
  // 排除的域名 (广告、分析等)
  EXCLUDED_DOMAINS: [
    'google-analytics.com',
    'googletagmanager.com',
    'analytics.google.com',
    'doubleclick.net',
    'facebook.com/tr',
    'segment.io',
    'amplitude.com',
    'mixpanel.com',
  ],
  // 静态资源扩展名
  STATIC_RESOURCE_EXTENSIONS: [
    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
    '.css', '.scss', '.less',
    '.js', '.jsx', '.ts', '.tsx', '.map',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.mp3', '.mp4', '.webm', '.ogg',
    '.pdf', '.zip',
  ],
  // API 类型 MIME (不过滤)
  API_MIME_TYPES: [
    'application/json',
    'application/xml',
    'text/xml',
    'text/plain',
    'text/event-stream',
  ],
} as const;

// 执行环境
export enum ExecutionWorld {
  ISOLATED = 'ISOLATED',  // 隔离环境 (推荐)
  MAIN = 'MAIN',          // 主页面环境
}

// 默认窗口尺寸
export const DEFAULT_WINDOW = {
  WIDTH: 1280,
  HEIGHT: 720,
} as const;
