/**
 * An assertive-free announcement for screen readers (D04 #24).
 *
 * Every FAILURE in this app was announced — `InlineError` carries `role="alert"` — while every
 * SUCCESS was silent. A sighted user watches the status badge flip from Assigned to In Progress;
 * a screen-reader user pressed "Start work" and heard nothing at all, with no way to tell whether
 * the action had worked, failed quietly, or not registered. Confirmation is not a nicety when the
 * visual confirmation is the only one you have.
 *
 * Visually hidden by design: the sighted confirmation already exists (the badge changed). This
 * closes the gap for people who cannot see it, without adding banner noise for people who can.
 *
 * `aria-live="polite"` waits for a pause rather than interrupting; `role="status"` carries the
 * same semantics for older AT. Announcing requires the node to be in the DOM BEFORE the text
 * changes — which is why this renders unconditionally and only its content varies.
 */
export function LiveRegion({ message }: { message: string | null }) {
  return (
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message ?? ''}
    </p>
  );
}
