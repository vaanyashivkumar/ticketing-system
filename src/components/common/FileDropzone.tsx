import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { UploadCloud } from 'lucide-react';

/**
 * Drag-and-drop file input (C32).
 *
 * ACCESSIBILITY IS THE WHOLE DESIGN HERE. A drop zone is, by itself, unusable without a mouse:
 * there is no keyboard gesture for "drag". So the real control is a plain `<input type="file">`
 * inside a `<label>` — focusable, operable by Enter/Space, announced properly — and dragging is an
 * ENHANCEMENT layered on top for people who have a pointer. If the drop handling were removed
 * entirely this component would still work for everyone; that is the test it has to pass.
 *
 * The visible ring on `:focus-within` exists because focus lands on the visually-hidden input —
 * without it a keyboard user would have focus here with nothing on screen to show it.
 */
export function FileDropzone({
  onFiles,
  accept,
  disabled = false,
  hint,
  label = 'Add files',
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  disabled?: boolean;
  hint?: string;
  label?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length) onFiles(files);
    // Reset, so selecting the SAME file twice in a row still fires a change event.
    if (inputRef.current) inputRef.current.value = '';
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    take(e.dataTransfer.files);
  };

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={[
        'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center transition-colors duration-base ease-standard',
        'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus-ring',
        disabled
          ? 'cursor-not-allowed border-border bg-surface-sunken opacity-60'
          : dragging
            ? 'border-primary bg-accent-tint'
            : 'border-border-strong bg-surface-sunken hover:border-primary',
      ].join(' ')}
    >
      <UploadCloud size={20} className="text-text-secondary" aria-hidden />
      <span className="text-body-sm text-text">
        <span className="font-medium text-primary-text">{label}</span>
        {/* "or drag them here" is deliberately secondary: dragging is the optional path. */}
        <span className="text-text-secondary"> or drag them here</span>
      </span>
      {hint && <span className="text-caption text-text-secondary">{hint}</span>}
      <input
        ref={inputRef}
        type="file"
        multiple
        disabled={disabled}
        accept={accept}
        onChange={(e: ChangeEvent<HTMLInputElement>) => take(e.target.files)}
        className="sr-only"
      />
    </label>
  );
}
