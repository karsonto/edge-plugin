import { MessageSquare, Settings } from 'lucide-react';
import { clsx } from 'clsx';

export type TabType = 'chat' | 'settings';

interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="flex gap-2 p-3 bg-gray-50 border-b border-gray-200">
      <button
        onClick={() => onTabChange('chat')}
        className={clsx(
          'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all',
          activeTab === 'chat'
            ? 'bg-white text-primary shadow-sm'
            : 'text-gray-600 hover:bg-white/50'
        )}
      >
        <MessageSquare size={18} />
        对话
      </button>
      <button
        onClick={() => onTabChange('settings')}
        className={clsx(
          'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all',
          activeTab === 'settings'
            ? 'bg-white text-primary shadow-sm'
            : 'text-gray-600 hover:bg-white/50'
        )}
      >
        <Settings size={18} />
        设置
      </button>
    </div>
  );
}
