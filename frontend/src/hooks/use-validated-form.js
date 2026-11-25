import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

export function useValidatedForm(schema, options) {
  return useForm({ ...options, resolver: zodResolver(schema) });
}
