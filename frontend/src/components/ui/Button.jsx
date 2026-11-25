import { LoaderCircle } from 'lucide-react';

const variants = {
  primary: 'border-transparent bg-accent text-ink hover:bg-accent-hover',
  secondary:
    'border-transparent bg-surface text-foreground hover:border-control',
  outline: 'border-control text-foreground hover:bg-surface',
  ghost: 'border-transparent text-foreground hover:bg-surface',
};

export function buttonClasses(variant = 'primary', className = '') {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-control border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:border-transparent disabled:bg-surface disabled:text-disabled ${variants[variant]} ${className}`;
}

export function Button({
  variant,
  loading = false,
  disabled,
  type = 'button',
  className,
  children,
  ...props
}) {
  return (
    <button
      {...props}
      type={type}
      className={buttonClasses(variant, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      )}
      {children}
    </button>
  );
}

export function IconButton({ label, className = '', ...props }) {
  return (
    <Button
      variant="ghost"
      {...props}
      aria-label={label}
      className={`w-11 shrink-0 px-0! ${className}`}
    />
  );
}
