import { AlertCircle } from 'lucide-react';

/**
 * The canonical inline error. Copy-pasted verbatim across three unrelated pages (D04 #20).
 *
 * `role="alert"` is not decoration: it is what makes a failure reach a screen-reader user at all.
 * Centralising it means the next page cannot forget it — D04 #24 found that only failures are
 * announced anywhere in this app, and that is the half worth never losing.
 */
export function InlineError({ message, className = '' }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-md border border-error bg-error-bg px-3 py-2 text-body-sm text-error-text ${className}`}
    >
      <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden /> {message}
    </div>
  );
}
