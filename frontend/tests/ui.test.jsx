import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Button } from '../src/components/ui/Button.jsx';
import { FormField, TextInput } from '../src/components/ui/fields.jsx';
import { EmptyState, ErrorState } from '../src/components/ui/states.jsx';
import { ToastViewport } from '../src/components/common/ToastViewport.jsx';
import { useValidatedForm } from '../src/hooks/use-validated-form.js';
import { useUiStore } from '../src/stores/ui.js';

const schema = z.object({
  email: z.email({ error: 'Enter a valid email address' }),
});

function ExampleForm({ onSubmit }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useValidatedForm(schema);
  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)}>
      <FormField
        label="Email address"
        hint="Enter your work email"
        error={errors.email?.message}
      >
        {(props) => (
          <TextInput type="email" {...register('email')} {...props} />
        )}
      </FormField>
      <Button type="submit">Submit</Button>
    </form>
  );
}

describe('shared UI', () => {
  it('renders the four button variants and blocks disabled and in-flight actions', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <>
        <Button variant="primary" onClick={onClick}>
          Primary
        </Button>
        <Button variant="secondary" onClick={onClick} disabled>
          Secondary
        </Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost" onClick={onClick} loading>
          Ghost
        </Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Primary' })).toHaveClass(
      'bg-accent',
    );
    expect(screen.getByRole('button', { name: 'Secondary' })).toHaveClass(
      'bg-surface',
    );
    expect(screen.getByRole('button', { name: 'Outline' })).toHaveClass(
      'border-control',
    );
    expect(screen.getByRole('button', { name: 'Ghost' })).toHaveClass(
      'border-transparent',
    );
    expect(screen.getByRole('button', { name: 'Ghost' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Secondary' }));
    await user.click(screen.getByRole('button', { name: 'Ghost' }));
    expect(onClick).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Primary' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('connects Zod validation to accessible field feedback and submits valid values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ExampleForm onSubmit={onSubmit} />);
    const field = screen.getByRole('textbox', { name: 'Email address' });
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a valid email address',
    );
    expect(field).toHaveFocus();
    expect(field).toHaveAccessibleDescription(
      'Enter your work email Enter a valid email address',
    );
    expect(field).toHaveAttribute('aria-invalid', 'true');
    await user.type(field, 'reader@example.test');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit.mock.calls[0][0]).toEqual({ email: 'reader@example.test' });
  });

  it('renders empty and accessible error states with an optional working retry action', async () => {
    const retry = vi.fn();
    render(
      <>
        <EmptyState title="No results" />
        <ErrorState description="The service is busy." onRetry={retry} />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'No results' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('The service is busy.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('announces notifications from shared UI state and dismisses the current toast', async () => {
    render(<ToastViewport />);
    act(() => useUiStore.getState().showToast('Changes saved'));
    const previous = useUiStore.getState().toast;
    expect(screen.getByRole('status')).toHaveTextContent('Changes saved');
    act(() => {
      useUiStore.getState().showToast('Link copied');
      useUiStore.getState().dismissToast(previous);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Link copied');
    await userEvent.click(
      screen.getByRole('button', { name: 'Dismiss notification' }),
    );
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
