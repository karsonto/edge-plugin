import { useState, useEffect, useCallback } from 'react';
import { TabBar, TabType } from './components/shared/TabBar';
import { ChatContainer } from './components/Chat/ChatContainer';
import { ContextPreview } from './components/Context/ContextPreview';
import { FileList } from './components/Context/FileList';
import { QuickActionsGrid } from './components/QuickActions/QuickActionsGrid';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { useChat, useSettings, usePageContext } from './hooks';
import { useFileContext } from './hooks/useFileContext';
import { replacePlaceholders } from '@/shared/utils/text-processor';
import { SUPPORTED_EXTENSIONS } from '@/shared/utils/file-parser';
import { APP_NAME } from '@/shared/brand';
import { Rocket, RefreshCw, Trash2, Maximize2, Frame } from 'lucide-react';
import { BottomSheet } from './components/shared/BottomSheet';
import { MessageBubble } from './components/Chat/MessageBubble';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [inputValue, setInputValue] = useState('');
  const [chatZoomOpen, setChatZoomOpen] = useState(false);
  // 默认开启：发送提问时附带当前网页抓取内容
  const [includePageContext, setIncludePageContext] = useState(true);
  // 页面读取工具开关：开启后进入浏览器自动化模式
  const [enableFunctionCalling, setEnableFunctionCalling] = useState(false);
  // 文件拖拽状态
  const [isDragging, setIsDragging] = useState(false);

  // Hooks
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    stop,
    selectedScreenshotTarget,
    startScreenshotTargetPicker,
    clearSelectedScreenshotTarget,
  } = useChat();
  const {
    quickActions,
    ai,
    isLoaded: settingsLoaded,
    loadSettings,
    saveSettings,
  } = useSettings();
  const {
    context: pageContext,
    isLoading: contextLoading,
    fetchPageContext,
  } = usePageContext();
  const {
    files: uploadedFiles,
    isProcessing: filesProcessing,
    error: fileError,
    addFiles,
    removeFile,
    clearFiles,
    getCombinedContent: getFileContent,
  } = useFileContext();

  // 初始化：加载设置和页面上下文
  useEffect(() => {
    document.title = APP_NAME;
    loadSettings();
    fetchPageContext();
  }, []);

  // 离开对话 Tab 时自动关闭放大 Sheet
  useEffect(() => {
    if (activeTab !== 'chat') setChatZoomOpen(false);
  }, [activeTab]);

  // 同步自动化开关状态
  useEffect(() => {
    setEnableFunctionCalling(ai.enableFunctionCalling || false);
  }, [ai.enableFunctionCalling]);

  // 快捷键：Ctrl+Shift+R 刷新页面内容（sidepanel 内）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+R 或 Cmd+Shift+R 刷新页面内容
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        if (!contextLoading) {
          fetchPageContext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [contextLoading, fetchPageContext]);

  // 监听来自 content script 的刷新请求
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message?.type === 'REFRESH_PAGE_CONTEXT') {
        console.log('[Sidepanel] 收到刷新页面内容请求');
        if (!contextLoading) {
          fetchPageContext();
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [contextLoading, fetchPageContext]);

  // 文件拖拽处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 只有离开整个容器时才取消拖拽状态
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      addFiles(files);
    }
  }, [addFiles]);

  // 处理自动化开关切换
  const handleToggleFunctionCalling = (enabled: boolean) => {
    setEnableFunctionCalling(enabled);
    // 立即保存到设置
    saveSettings({ ai: { ...ai, enableFunctionCalling: enabled } });
  };

  // 构建合并后的上下文（网页内容 + 文件内容）
  const buildCombinedContext = useCallback(() => {
    if (!includePageContext && uploadedFiles.length === 0) {
      return undefined;
    }

    const fileContent = getFileContent();
    
    // 如果只有文件内容，创建一个虚拟的 PageContext
    if (!includePageContext || !pageContext) {
      if (fileContent) {
        return {
          title: '上传的文件',
          url: 'file://uploaded',
          content: fileContent,
          metadata: { wordCount: fileContent.length },
          timestamp: Date.now(),
        };
      }
      return undefined;
    }

    // 合并网页内容和文件内容
    if (fileContent) {
      return {
        ...pageContext,
        content: `${pageContext.content}\n\n---\n\n${fileContent}`,
      };
    }

    return pageContext;
  }, [includePageContext, pageContext, uploadedFiles.length, getFileContent]);

  // 处理发送消息
  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    
    // 如果不是自定义端点，检查 API Key
    if (ai.provider !== 'custom' && !ai.apiKey) {
      alert('请先在设置中配置 API Key');
      setActiveTab('settings');
      return;
    }

    // 如果是自定义端点，检查端点是否配置
    if (ai.provider === 'custom' && !ai.customEndpoint) {
      alert('请先在设置中配置自定义端点');
      setActiveTab('settings');
      return;
    }

    // 传递完整的 aiConfig（包含 enableFunctionCalling）
    const aiConfigWithFC = { ...ai, enableFunctionCalling };
    // 构建合并后的上下文（网页 + 文件）
    const combinedContext = buildCombinedContext();
    sendMessage(inputValue, aiConfigWithFC, combinedContext);
    setInputValue('');
  };

  // 处理快捷操作点击
  const handleQuickAction = (action: any) => {
    // 如果不是自定义端点，检查 API Key
    if (ai.provider !== 'custom' && !ai.apiKey) {
      alert('请先在设置中配置 API Key');
      setActiveTab('settings');
      return;
    }

    // 如果是自定义端点，检查端点是否配置
    if (ai.provider === 'custom' && !ai.customEndpoint) {
      alert('请先在设置中配置自定义端点');
      setActiveTab('settings');
      return;
    }

    // 构建合并后的上下文
    const combinedContext = buildCombinedContext();
    
    if (!combinedContext?.content) {
      alert('无法获取内容，请刷新页面或上传文件后重试');
      return;
    }

    // 替换提示词中的 {context}
    const prompt = replacePlaceholders(action.prompt, {
      context: combinedContext.content,
    });

    // 不预填输入框：快捷操作直接发送，不占用用户输入区
    setInputValue('');
    const aiConfigWithFC = { ...ai, enableFunctionCalling };
    // 传入合并后的上下文
    sendMessage(prompt, aiConfigWithFC, combinedContext);
  };

  // 处理刷新页面内容
  const handleRefresh = () => {
    fetchPageContext();
  };

  // 处理清空对话
  const handleClear = () => {
    if (messages.length === 0) return;
    if (confirm('确定要清空当前对话吗？')) {
      clearMessages();
    }
  };

  // 处理编辑快捷操作
  const handleEditQuickActions = () => {
    setActiveTab('settings');
    // 滚动到快捷操作配置区域
    setTimeout(() => {
      const element = document.querySelector('[data-quick-actions-config]');
      element?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  return (
    <div 
      className="h-screen flex flex-col bg-white relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 文件拖拽 Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-xl shadow-2xl p-8 text-center border-2 border-dashed border-primary">
            <div className="text-4xl mb-3">📄</div>
            <p className="text-lg font-semibold text-gray-800 mb-2">释放文件以解析</p>
            <p className="text-sm text-gray-500">
              支持: {SUPPORTED_EXTENSIONS.join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gradient-to-r from-primary to-primary-dark text-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <Rocket size={20} className="text-primary" />
          </div>
          <h1 className="text-lg font-bold truncate max-w-[200px]">{APP_NAME}</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => (selectedScreenshotTarget ? clearSelectedScreenshotTarget() : startScreenshotTargetPicker())}
            className="w-8 h-8 flex items-center justify-center rounded-md bg-white/20 hover:bg-white/30 transition-colors"
            title={selectedScreenshotTarget ? '清除已选截图目标' : '选择截图目标'}
          >
            <Frame size={16} />
          </button>
          <button
            onClick={() => setChatZoomOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-md bg-white/20 hover:bg-white/30 transition-colors"
            title="放大对话"
            disabled={activeTab !== 'chat' || messages.length === 0}
          >
            <Maximize2 size={16} />
          </button>
          <button
            onClick={handleRefresh}
            className="w-8 h-8 flex items-center justify-center rounded-md bg-white/20 hover:bg-white/30 transition-colors"
            title="刷新页面内容 (Ctrl+Shift+R)"
            disabled={contextLoading}
          >
            <RefreshCw size={16} className={contextLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleClear}
            className="w-8 h-8 flex items-center justify-center rounded-md bg-white/20 hover:bg-white/30 transition-colors"
            title="清空对话"
            disabled={messages.length === 0}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      <BottomSheet open={chatZoomOpen} title="对话放大" onClose={() => setChatZoomOpen(false)}>
        <div className="space-y-4 text-[15px] leading-7">
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              role={m.role}
              content={m.content}
              timestamp={m.timestamp}
              isStreaming={m.isStreaming}
              kind={m.kind}
              toolLog={m.toolLog}
            />
          ))}
        </div>
      </BottomSheet>

      {/* Tab Bar */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'chat' ? (
          <div className="h-full flex flex-col">
            {/* Context Preview */}
            <ContextPreview context={pageContext} isLoading={contextLoading} />

            {/* File List */}
            <FileList
              files={uploadedFiles}
              onRemove={removeFile}
              onClear={clearFiles}
            />

            {/* 文件处理状态 */}
            {filesProcessing && (
              <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-600">
                正在解析文件...
              </div>
            )}
            {fileError && (
              <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-xs text-red-600">
                {fileError}
              </div>
            )}

            {/* Quick Actions */}
            {settingsLoaded && (
              <QuickActionsGrid
                actions={quickActions}
                onActionClick={handleQuickAction}
                onEditClick={handleEditQuickActions}
                disabled={isLoading || (ai.provider !== 'custom' && !ai.apiKey) || (ai.provider === 'custom' && !ai.customEndpoint)}
              />
            )}

            {/* Toggle Bar (开关栏) */}
            <div className="px-5 py-2 border-t border-gray-200 bg-white flex justify-between items-center">
              {/* 左侧：页面读取工具开关 */}
              <div className="flex items-center gap-2 select-none">
                <span className="text-xs text-gray-600 whitespace-nowrap">
                  页面读取工具
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enableFunctionCalling}
                  onClick={() => handleToggleFunctionCalling(!enableFunctionCalling)}
                  className={
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 " +
                    (enableFunctionCalling ? "bg-primary" : "bg-gray-300")
                  }
                  title="开启后，AI 会进入浏览器自动化模式，可读取页面并执行低风险表单操作"
                >
                  <span
                    className={
                      "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " +
                      (enableFunctionCalling ? "translate-x-4" : "translate-x-1")
                    }
                  />
                </button>
              </div>

              {/* 右侧：携带网页内容开关 */}
              <div className="flex items-center gap-2 select-none">
                <span className="text-xs text-gray-600 whitespace-nowrap">
                  携带网页内容
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={includePageContext}
                  onClick={() => setIncludePageContext(v => !v)}
                  className={
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 " +
                    (includePageContext ? "bg-primary" : "bg-gray-300")
                  }
                  title="开启后，每次发送问题都会附带当前网页抓取内容"
                >
                  <span
                    className={
                      "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " +
                      (includePageContext ? "translate-x-4" : "translate-x-1")
                    }
                  />
                </button>
              </div>
            </div>

            {selectedScreenshotTarget && (
              <div className="px-5 py-2 border-t border-gray-100 bg-indigo-50 text-xs text-indigo-700">
                已选择
                {selectedScreenshotTarget.kind === 'iframe'
                  ? ' iframe'
                  : selectedScreenshotTarget.ownerIframeElementId
                    ? ' iframe 内滚动区域'
                    : '滚动区域'}
                ：
                {selectedScreenshotTarget.name ||
                  selectedScreenshotTarget.src ||
                  selectedScreenshotTarget.selectorHint ||
                  selectedScreenshotTarget.elementId}
                {selectedScreenshotTarget.ownerIframeInfo && (
                  <>
                    {' '}· 所属 iframe：
                    {selectedScreenshotTarget.ownerIframeInfo.name ||
                      selectedScreenshotTarget.ownerIframeInfo.src ||
                      selectedScreenshotTarget.ownerIframeInfo.selectorHint ||
                      selectedScreenshotTarget.ownerIframeInfo.elementId}
                  </>
                )}
                {selectedScreenshotTarget.kind === 'iframe' && selectedScreenshotTarget.sameOrigin === false && '（跨域，截图将降级为页面可见区域）'}
              </div>
            )}

            {/* Chat */}
            <div className="flex-1 overflow-hidden">
              <ChatContainer
                messages={messages}
                isLoading={isLoading}
                error={error}
                inputValue={inputValue}
                onInputChange={setInputValue}
                onSend={handleSend}
                onStop={stop}
              />
            </div>
          </div>
        ) : (
          <SettingsPanel />
        )}
      </main>
    </div>
  );
}

export default App;
