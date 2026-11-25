import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { FormField, TextInput, Textarea } from '../../components/ui/fields.jsx';
import { Container, SectionHeading } from '../../components/ui/surfaces.jsx';
import { useValidatedForm } from '../../hooks/use-validated-form.js';

function PasswordInput({ props, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <TextInput
        {...props}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
      />
      <IconButton
        label={visible ? 'Hide password' : 'Show password'}
        aria-controls={props.id}
        disabled={props.disabled}
        onClick={() => setVisible(!visible)}
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="size-5" />
        ) : (
          <Eye aria-hidden="true" className="size-5" />
        )}
      </IconButton>
    </div>
  );
}

export const fullNameField = {
  name: 'fullName',
  label: 'Full name',
  autoComplete: 'name',
};
export const emailField = {
  name: 'email',
  label: 'Email address',
  autoComplete: 'email',
  type: 'email',
};
export const passwordField = {
  name: 'password',
  label: 'Password',
  autoComplete: 'current-password',
  type: 'password',
};
export const newPasswordField = {
  ...passwordField,
  label: 'New password',
  autoComplete: 'new-password',
  hint: 'Use at least 12 characters.',
};

export function AuthForm({
  fields,
  schema,
  defaultValues,
  submit,
  action,
  children,
  disabled = false,
}) {
  const [feedback, setFeedback] = useState(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useValidatedForm(schema, { defaultValues });

  async function onSubmit(values) {
    setFeedback(null);
    try {
      const result = await submit(values);
      if (result?.message) setFeedback({ message: result.message });
    } catch (error) {
      if (error.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
        for (const { path } of error.details) {
          const field = fields.find(({ name }) => path === `body.${name}`);
          if (field)
            setError(field.name, {
              type: 'server',
              message: 'Check this value and try again.',
            });
        }
      }
      setFeedback({ message: error.message, error: true });
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      {fields.map(({ name, label, hint, autoComplete, type = 'text' }) => (
        <FormField
          key={name}
          label={label}
          hint={hint}
          error={errors[name]?.message}
        >
          {(accessibility) => {
            const props = {
              ...register(name),
              ...accessibility,
              disabled: disabled || isSubmitting,
            };
            if (type === 'password')
              return (
                <PasswordInput props={props} autoComplete={autoComplete} />
              );
            if (type === 'textarea')
              return <Textarea {...props} maxLength={500} />;
            return (
              <TextInput {...props} type={type} autoComplete={autoComplete} />
            );
          }}
        </FormField>
      ))}
      {children?.({ register, isSubmitting })}
      {feedback && (
        <p
          role={feedback.error ? 'alert' : 'status'}
          className={
            feedback.error ? 'text-sm text-danger-text' : 'text-sm text-success'
          }
        >
          {feedback.message}
        </p>
      )}
      <div>
        <Button type="submit" disabled={disabled} loading={isSubmitting}>
          {action}
        </Button>
      </div>
    </form>
  );
}

export function AuthPage({ title, description, children }) {
  return (
    <Container className="py-12 sm:py-16">
      <div className="mx-auto grid max-w-md gap-6 rounded-panel border border-line bg-surface p-5 sm:p-8">
        <SectionHeading as="h1" description={description}>
          {title}
        </SectionHeading>
        {children}
      </div>
    </Container>
  );
}
