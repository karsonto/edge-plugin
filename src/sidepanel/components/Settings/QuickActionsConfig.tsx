import { Plus, Trash2, Zap } from 'lucide-react';
import type { QuickAction } from '@/shared/types';
import { generateMessageId } from '@/shared/utils';

interface QuickActionsConfigProps {
  actions: QuickAction[];
  onUpdate: (id: string, updates: Partial<QuickAction>) => void;
  onAdd: (action: QuickAction) => void;
  onRemove: (id: string) => void;
}

export function QuickActionsConfig({
  actions,
  onUpdate,
  onAdd,
  onRemove,
}: QuickActionsConfigProps) {
  const handleAdd = () => {
    const newAction: QuickAction = {
      id: `custom_${generateMessageId()}`,
      emoji: '✨',
      name: '新操作',
      prompt: '请对以下内容进行分析：\n\n{context}',
      order: actions.length,
    };
    onAdd(newAction);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Zap size={16} />
          快捷操作配置
        </h3>
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          自定义快捷操作，配置提示词模板。点击快捷按钮时，会将提示词和页面内容发送给 AI。
          使用 <code className="px-1.5 py-0.5 bg-gray-100 rounded text-primary">{'{context}'}</code> 作为页面内容的占位符。
        </p>

        <div className="space-y-3">
          {actions.map((action) => (
            <div
              key={action.id}
              className="p-3 border border-gray-200 rounded-lg bg-gray-50"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <span className="text-lg">{action.emoji}</span>
                  <span>{action.name}</span>
                </div>
                <button
                  onClick={() => {
                    if (confirm('确定要删除这个快捷操作吗？')) {
                      onRemove(action.id);
                    }
                  }}
                  className="text-red-500 hover:text-red-700 transition-colors"
                  title="删除"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    图标（Emoji）
                  </label>
                  <input
                    type="text"
                    value={action.emoji}
                    onChange={(e) => onUpdate(action.id, { emoji: e.target.value })}
                    maxLength={2}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-primary bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    名称
                  </label>
                  <input
                    type="text"
                    value={action.name}
                    onChange={(e) => onUpdate(action.id, { name: e.target.value })}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-primary bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    提示词模板
                  </label>
                  <textarea
                    value={action.prompt}
                    onChange={(e) => onUpdate(action.id, { prompt: e.target.value })}
                    rows={3}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-primary bg-white resize-none"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleAdd}
          className="w-full mt-3 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-primary font-medium hover:border-primary hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          添加新的快捷操作
        </button>
      </div>
    </div>
  );
}
