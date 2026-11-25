import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from './Button.jsx';

export function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Previous
      </Button>
      <span aria-current="page" className="text-sm text-muted">
        Page {page} of {totalPages}
      </span>
      <Button
        variant="outline"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next <ArrowRight aria-hidden="true" className="size-4" />
      </Button>
    </nav>
  );
}
