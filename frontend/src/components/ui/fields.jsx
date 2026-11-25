import { useId } from 'react';

export function TextInput({ className = '', ...props }) {
  return <input {...props} className={`form-control ${className}`} />;
}

export function Textarea({ className = '', ...props }) {
  return (
    <textarea
      rows={4}
      {...props}
      className={`form-control resize-y ${className}`}
    />
  );
}

export function Select({ className = '', ...props }) {
  return <select {...props} className={`form-control ${className}`} />;
}

export function Checkbox({ className = '', ...props }) {
  return (
    <input
      {...props}
      type="checkbox"
      className={`size-5 shrink-0 accent-accent disabled:cursor-not-allowed ${className}`}
    />
  );
}

export function ValidationMessage({ children, ...props }) {
  return (
    <p {...props} className="text-sm text-danger-text">
      {children}
    </p>
  );
}

export function FormField({ id, label, hint, error, children }) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="grid gap-2">
      <label htmlFor={fieldId} className="text-sm font-semibold">
        {label}
      </label>
      {children({
        id: fieldId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <ValidationMessage id={errorId} role="alert">
          {error}
        </ValidationMessage>
      )}
    </div>
  );
}
