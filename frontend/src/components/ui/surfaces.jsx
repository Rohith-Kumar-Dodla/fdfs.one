export function Container({ as: Element = 'div', className = '', ...props }) {
  return (
    <Element
      {...props}
      className={`mx-auto w-full max-w-site px-5 sm:px-8 lg:px-10 ${className}`}
    />
  );
}

export function Card({ as: Element = 'div', className = '', ...props }) {
  return (
    <Element
      {...props}
      className={`rounded-panel border border-line bg-surface p-5 sm:p-6 ${className}`}
    />
  );
}

const tones = {
  neutral: 'border-line bg-base text-muted',
  accent: 'border-accent/40 bg-accent/10 text-accent',
  success: 'border-success/40 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  danger: 'border-danger/40 bg-danger/10 text-danger-text',
};

export function Badge({ tone = 'neutral', children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  as: Heading = 'h2',
  id,
  children,
  description,
}) {
  return (
    <div className="grid gap-2.5">
      <Heading
        id={id}
        className="text-3xl font-bold tracking-tight sm:text-4xl"
      >
        {children}
      </Heading>
      {description && (
        <p className="max-w-copy leading-relaxed text-muted">{description}</p>
      )}
    </div>
  );
}
