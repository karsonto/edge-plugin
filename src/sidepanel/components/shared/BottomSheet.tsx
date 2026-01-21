import { useEffect } from 'react';
import { X } from 'lucide-react';

type BottomSheetProps = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
};

export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    // Lock scrolling behind the sheet
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto w-full max-w-[520px]">
          <div className="rounded-t-2xl bg-white shadow-2xl border border-gray-200 animate-[sheetUp_.18s_ease-out]">
            {/* Grabber */}
            <div className="flex justify-center pt-2">
              <div className="h-1 w-10 rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className="text-sm font-semibold text-gray-900 truncate">{title || '内容'}</div>
              <button
                className="p-2 rounded-lg hover:bg-gray-100"
                onClick={onClose}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="px-4 pb-4 max-h-[75vh] overflow-y-auto scrollbar-thin">
              {children}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes sheetUp {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

