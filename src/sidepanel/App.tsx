import { useState, useEffect } from 'react';
import { TabBar, TabType } from './components/shared/TabBar';
import { ChatContainer } from './components/Chat/ChatContainer';
import { ContextPreview } from './components/Context/ContextPreview';
import { QuickActionsGrid } from './components/QuickActions/QuickActionsGrid';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { useChat, useSettings, usePageContext } from './hooks';
import { replacePlaceholders } from '@/shared/utils/text-processor';
import { APP_NAME } from '@/shared/brand';
import { Rocket, RefreshCw, Trash2 } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [inputValue, setInputValue] = useState('');
  // 默认开启：发送提问时附带当前网页抓取内容
  const [includePageContext, setIncludePageContext] = useState(true);
  // Function Calling 开关
  const [enableFunctionCalling, setEnableFunctionCalling] = useState(false);

  // Hooks
  const { messages, isLoading, error, sendMessage, clearMessages } = useChat();
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

  // 初始化：加载设置和页面上下文
  useEffect(() => {
    document.title = APP_NAME;
    loadSettings();
    fetchPageContext();
  }, []);

  // 同步 Function Calling 开关状态
  useEffect(() => {
    setEnableFunctionCalling(ai.enableFunctionCalling || false);
  }, [ai.enableFunctionCalling]);

  // 处理 Function Calling 开关切换
  const handleToggleFunctionCalling = (enabled: boolean) => {
    setEnableFunctionCalling(enabled);
    // 立即保存到设置
    saveSettings({ ai: { ...ai, enableFunctionCalling: enabled } });
  };

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
    sendMessage(inputValue, aiConfigWithFC, includePageContext ? pageContext?.content : undefined);
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

    if (!pageContext?.content) {
      alert('无法获取页面内容，请刷新后重试');
      return;
    }

    // 替换提示词中的 {context}
    const prompt = replacePlaceholders(action.prompt, {
      context: pageContext.content,
    });

    // 不预填输入框：快捷操作直接发送，不占用用户输入区
    setInputValue('');
    const aiConfigWithFC = { ...ai, enableFunctionCalling };
    sendMessage(prompt, aiConfigWithFC, pageContext.content);
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
    <div className="h-screen flex flex-col bg-white">
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
            onClick={handleRefresh}
            className="w-8 h-8 flex items-center justify-center rounded-md bg-white/20 hover:bg-white/30 transition-colors"
            title="刷新页面内容"
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

      {/* Tab Bar */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'chat' ? (
          <div className="h-full flex flex-col">
            {/* Context Preview */}
            <ContextPreview context={pageContext} isLoading={contextLoading} />

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
              {/* 左侧：Function Calling 开关 */}
              <div className="flex items-center gap-2 select-none">
                <span className="text-xs text-gray-600 whitespace-nowrap">
                  浏览器自动化
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
                  title="开启后，AI 可以调用浏览器工具（点击、输入、查询元素等）完成复杂任务"
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

            {/* Chat */}
            <div className="flex-1 overflow-hidden">
              <ChatContainer
                messages={messages}
                isLoading={isLoading}
                error={error}
                inputValue={inputValue}
                onInputChange={setInputValue}
                onSend={handleSend}
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
