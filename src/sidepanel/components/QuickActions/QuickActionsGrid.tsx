import { ActionButton } from './ActionButton';
import { Edit3, Zap } from 'lucide-react';
import type { QuickAction } from '@/shared/types';

interface QuickActionsGridProps {
  actions: QuickAction[];
  onActionClick: (action: QuickAction) => void;
  onEditClick: () => void;
  disabled?: boolean;
}

export function QuickActionsGrid({
  actions,
  onActionClick,
  onEditClick,
  disabled,
}: QuickActionsGridProps) {
  if (actions.length === 0) {
    return (
      <div className="p-4 border-b border-gray-200">
        <div className="text-center text-sm text-gray-400 py-4">
          暂无快捷操作，请在设置中添加
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 border-b border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
          <Zap size={14} />
          快捷操作
        </span>
        <button
          onClick={onEditClick}
          className="text-xs text-primary font-medium hover:text-primary-dark transition-colors flex items-center gap-1"
        >
          <Edit3 size={12} />
          编辑
        </button>
      </div>

      {/* Actions Grid */}
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => (
          <ActionButton
            key={action.id}
            emoji={action.emoji}
            name={action.name}
            onClick={() => onActionClick(action)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}
