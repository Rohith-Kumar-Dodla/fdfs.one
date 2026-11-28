import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './Button.jsx';

export function Dialog({
  open,
  onClose,
  title,
  children,
  className = '',
  contentClassName = '',
  closeLabel = 'Close dialog',
  closeIcon: CloseIcon = X,
  describedBy,
}) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-auto rounded-panel border border-line bg-surface text-foreground backdrop:bg-nav/80 ${className}`}
    >
      <div className={`p-5 sm:p-6 ${contentClassName}`}>
        <header className="mb-4 flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-xl font-semibold">
            {title}
          </h2>
          <IconButton label={closeLabel} onClick={onClose}>
            <CloseIcon aria-hidden="true" className="size-5" />
          </IconButton>
        </header>
        {children}
      </div>
    </dialog>
  );
}
