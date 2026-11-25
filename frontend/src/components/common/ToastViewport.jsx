import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useUiStore } from '../../stores/ui.js';
import { IconButton } from '../ui/Button.jsx';

export function ToastViewport() {
  const toast = useUiStore((state) => state.toast);
  const dismissToast = useUiStore((state) => state.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => dismissToast(toast), 7000);
    return () => window.clearTimeout(timer);
  }, [toast, dismissToast]);

  return (
    <div className="fixed right-4 bottom-4 z-30 w-[min(24rem,calc(100%-2rem))]">
      <div
        className={
          toast
            ? 'flex items-center gap-3 rounded-panel border border-line bg-surface px-4 py-2 shadow-lg'
            : undefined
        }
      >
        <div role="status" className="flex-1 text-sm">
          {toast?.message}
        </div>
        {toast && (
          <IconButton
            label="Dismiss notification"
            onClick={() => dismissToast(toast)}
          >
            <X aria-hidden="true" className="size-5" />
          </IconButton>
        )}
      </div>
    </div>
  );
}
