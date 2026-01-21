import { clsx } from 'clsx';

interface ActionButtonProps {
  emoji: string;
  name: string;
  onClick: () => void;
  disabled?: boolean;
}

export function ActionButton({ emoji, name, onClick, disabled }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'px-3 py-2.5 border border-gray-200 bg-white rounded-lg',
        'text-sm text-left transition-all',
        'flex items-center gap-2',
        'hover:border-primary hover:bg-gray-50 hover:-translate-y-0.5 hover:shadow-md',
        'active:translate-y-0',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none'
      )}
    >
      <span className="text-lg flex-shrink-0">{emoji}</span>
      <span className="font-medium text-gray-700 line-clamp-1">{name}</span>
    </button>
  );
}
