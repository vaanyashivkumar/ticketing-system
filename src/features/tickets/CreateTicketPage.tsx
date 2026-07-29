import { useMemo, useState, useId, cloneElement, type ReactElement, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, X } from 'lucide-react';
import { useAuth } from '@hooks/useAuth';
import { useTicketStore } from '@stores/ticketStore';
import { destinationsFor, categoriesFor, categoryById } from '@domain/routing/routingEngine';
import { ConfigService } from '@services/configService';
import { fieldFormatError, NOT_APPLICABLE } from '@domain/validation/fieldFormat';
import { attachmentRejection } from '@services/ticketService';
import { ATTACHMENT_LIMITS } from '@config/attachments.config';
import { FileDropzone } from '@components/common/FileDropzone';
import { DEPARTMENTS } from '@config/departments.config';
import { PageHeader } from '@components/common/PageHeader';
import { InlineError } from '@components/common/InlineError';
import type { DepartmentCode } from '@domain/types/auth.types';
import type { CategoryData, FieldDefinition, FieldType, Priority } from '@domain/types/ticket.types';
import { SELECTABLE_PRIORITIES, DEFAULT_PRIORITY } from '@domain/workflow/priorityEngine';

// Least urgent first: escalating should be a deliberate move down the list, not the default
// landing spot. The Priority Engine states both readings so neither order has to win.
const PRIORITIES = SELECTABLE_PRIORITIES;

/** A file held in the form before the ticket exists — same shape `TicketService.attach` takes. */
interface StagedFile {
  fileName: string;
  contentType: string;
  size: number;
  dataUrl: string;
}

/**
 * Create Ticket — the Dynamic Form Engine (P13 §4). The destination dropdown, category
 * dropdown and rendered fields ALL funnel through the routing config, so the UI can never
 * offer an invalid pair, and each category renders its own fields with zero hardcoded forms.
 */
export function CreateTicketPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const create = useTicketStore((s) => s.create);
  const attach = useTicketStore((s) => s.attach);
  const { session } = useAuth();

  const from = user!.departmentCode;
  // The same enable predicate the category list uses. Passing it here is what stops a route
  // whose categories are all disabled from being offered and then leading nowhere.
  const destinations = useMemo(() => destinationsFor(from, ConfigService.isCategoryEnabled), [from]);

  const [toDept, setToDept] = useState<DepartmentCode | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>(DEFAULT_PRIORITY);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  /** Per-field errors, so each attaches to the input it is about (D04 #25). */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /**
   * Files chosen before the ticket exists (C32). They are held here, NOT written, because
   * `TicketService.attach` needs a ticket id — so nothing reaches storage until the ticket does.
   * A cancelled create leaves no orphaned attachment bytes behind.
   */
  const [staged, setStaged] = useState<StagedFile[]>([]);

  // Disabled categories are withdrawn from the dropdown (D04 #1). The service re-checks at
  // submit — this is convenience, not enforcement.
  const categories = toDept ? categoriesFor(from, toDept, ConfigService.isCategoryEnabled) : [];
  const category = toDept && categoryId ? categoryById(from, toDept, categoryId) : undefined;

  const onSelectDestination = (code: DepartmentCode | '') => {
    setToDept(code);
    setCategoryId('');
    setFieldValues({});
  };
  const onSelectCategory = (id: string) => {
    setCategoryId(id);
    setFieldValues({});
    const cat = toDept ? categoryById(from, toDept, id) : undefined;
    if (cat) setPriority(cat.defaultPriority);
  };

  const submit = async (asSubmit: boolean) => {
    setError(null);
    setFieldErrors({});
    if (!session || !toDept || !category) {
      setError('Choose a destination department and category.');
      return;
    }

    /**
     * Per-field validation, so an error can be ATTACHED to the field it is about (D04 #25).
     * The service returns a single page-level string naming a field — fine for a human reading
     * the screen, useless to a screen reader, which cannot move the user to a field the error is
     * not linked to.
     *
     * This is UX, NOT enforcement: `TicketService.create` re-checks every one of these and remains
     * the authority. A draft is exempt — the point of a draft is that it is unfinished.
     */
    const errs: Record<string, string> = {};
    if (asSubmit) {
      if (!subject.trim()) errs.subject = 'Subject is required.';
      if (!description.trim()) errs.description = 'Description is required.';
      for (const f of category.fields) {
        if (f.required && !String(fieldValues[f.key] ?? '').trim()) errs[f.key] = `${f.label} is required.`;
      }
    }
    /**
     * Format errors apply to DRAFTS as well (C30) — the service checks them on both, so skipping
     * them here would let a draft fail at the service with a page-level string instead of an error
     * attached to the offending field. Required-ness stays submit-only: a draft may be incomplete,
     * but it may not hold a value already known to be malformed.
     *
     * Same `fieldFormatError` the service calls. The rule shown and the rule enforced are one
     * function, so the message a user reads cannot drift from the check that rejected them.
     */
    for (const f of category.fields) {
      if (errs[f.key]) continue;
      const formatError = fieldFormatError(f, fieldValues[f.key]);
      if (formatError) errs[f.key] = formatError;
    }
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      const n = Object.keys(errs).length;
      // "1 field needs" / "2 fields need" — the verb has to agree, not just the noun.
      setError(`${n} ${n === 1 ? 'field needs' : 'fields need'} attention before this can be ${asSubmit ? 'submitted' : 'saved'}.`);
      return;
    }

    const categoryData: CategoryData = { ...fieldValues };
    const result = await create(
      { toDeptCode: toDept, categoryId, subject, description, priority, categoryData },
      session,
      asSubmit,
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }

    /**
     * Attachments are written AFTER the ticket exists, because `attach()` needs a ticket id (C32).
     * Each file was already checked against the same guard when it was staged, so a failure here
     * is genuinely exceptional — storage filling between staging and submit. When it happens the
     * ticket has still been created, so we say exactly which file did not make it rather than
     * navigating away and leaving the user to notice a gap later.
     */
    const failed: string[] = [];
    for (const f of staged) {
      const r = await attach(result.value.id, { fileName: f.fileName, contentType: f.contentType, size: f.size, dataUrl: f.dataUrl }, session);
      if (!r.ok) failed.push(f.fileName);
    }
    if (failed.length) {
      setError(`Ticket created, but ${failed.length === 1 ? 'this file' : 'these files'} could not be attached: ${failed.join(', ')}. You can add ${failed.length === 1 ? 'it' : 'them'} from the ticket.`);
      setStaged([]);
      return;
    }
    navigate(asSubmit ? `/app/tickets/${result.value.id}` : '/app/tickets');
  };

  /** Staged files are validated on arrival, so limits are felt before the ticket is created. */
  const onFiles = (files: File[]) => {
    setError(null);
    const accepted: File[] = [];
    const rejected: string[] = [];
    let pending = staged.reduce((n, f) => n + f.size, 0);

    for (const file of files) {
      const why = attachmentRejection(
        { size: file.size, contentType: file.type },
        staged.length + accepted.length,
        pending,
      );
      if (why) {
        rejected.push(`${file.name} — ${why}`);
        continue;
      }
      accepted.push(file);
      pending += file.size;
    }
    if (rejected.length) setError(rejected.join(' '));

    // Read each accepted file to a data URL. The service stores base64, so this is the same
    // representation the details-page picker produces — no second encoding path.
    for (const file of accepted) {
      const reader = new FileReader();
      reader.onload = () =>
        setStaged((prev) => [
          ...prev,
          { fileName: file.name, contentType: file.type, size: file.size, dataUrl: String(reader.result) },
        ]);
      reader.readAsDataURL(file);
    }
  };

  // Left-anchored, not centered: every page shares one content left edge with the breadcrumbs
  // and header. max-w constrains line length only.
  return (
    <section aria-labelledby="ct-title" className="max-w-2xl">
      <PageHeader
        icon={PlusCircle}
        titleId="ct-title"
        title="Create Ticket"
        description="Raise a request on one of your department’s routes."
      />

      <InlineError message={error} className="mb-4" />

      {/* `card p-5`: a form is the one surface that earns more than the standard padding, and a
          utility still outranks the component layer. */}
      <div className="card space-y-4 p-5">
        <Field label="Destination department" required>
          <select className="input" value={toDept} onChange={(e) => onSelectDestination(e.target.value as DepartmentCode | '')}>
            <option value="">Select…</option>
            {destinations.map((d) => (
              <option key={d.code} value={d.code}>{DEPARTMENTS[d.code].name}</option>
            ))}
          </select>
        </Field>

        {toDept && (
          <Field label="Category" required>
            <select className="input" value={categoryId} onChange={(e) => onSelectCategory(e.target.value)}>
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Field>
        )}

        {category && (
          <>
            <Field label="Subject" required {...(fieldErrors.subject ? { error: fieldErrors.subject } : {})}>
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Short summary" />
            </Field>
            <Field label="Description" required {...(fieldErrors.description ? { error: fieldErrors.description } : {})}>
              {/* An explicit arbitrary value, on purpose. `min-h-20` renders the same 80px but is
                  MISLEADING here: this project remaps the spacing scale onto 8-point tokens, so a
                  step of 20 reads as 160px — and 16/20 are not in the remapped scale at all, so
                  they fall through to Tailwind's stock 4px grid and would not follow a retune of
                  the tokens. An honest arbitrary value beats a fake token. */}
              <textarea className="input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What do you need?" />
            </Field>
            <Field label="Priority" required>
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>

            <div className="border-t border-border pt-4">
              <p className="mb-3 text-label uppercase text-text-muted">
                {category.label} details
                {category.fields.some((f) => f.provisional) && (
                  <span className="ml-2 rounded-full bg-warning-bg px-1.5 py-0.5 text-label-sm normal-case text-warning-text">provisional (OQ-25/26)</span>
                )}
              </p>
              <div className="space-y-4">
                {category.fields.map((fdef) => (
                  <DynamicField
                    key={fdef.key}
                    field={fdef}
                    value={fieldValues[fdef.key] ?? ''}
                    onChange={(v) => setFieldValues((prev) => ({ ...prev, [fdef.key]: v }))}
                    {...(fieldErrors[fdef.key] ? { error: fieldErrors[fdef.key] } : {})}
                  />
                ))}
              </div>
            </div>

            {/**
             * Attachments (C32). Ticket-level, not a category field: a screenshot is a file, and
             * files belong to the attachment pipeline that enforces the per-file cap, the 3-file
             * limit and the 4 MB store budget. Held as a category value it would bypass all three
             * and take the localStorage quota with it.
             */}
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-label uppercase text-text-muted">Attachments</p>
              <FileDropzone
                label="Choose files"
                accept={ATTACHMENT_LIMITS.acceptAttribute}
                disabled={staged.length >= ATTACHMENT_LIMITS.maxPerTicket}
                hint={`PDF, PNG or JPEG · up to ${Math.round(ATTACHMENT_LIMITS.maxBytesPerFile / 1_048_576)} MB each · ${ATTACHMENT_LIMITS.maxPerTicket} files max`}
                onFiles={onFiles}
              />
              {staged.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {staged.map((f, i) => (
                    <li key={`${f.fileName}-${i}`} className="flex items-center justify-between gap-2 rounded-md bg-surface-sunken px-2 py-1 text-body-sm">
                      <span className="min-w-0 flex-1 truncate text-text">{f.fileName}</span>
                      {/* Sizes stack, so they are read down a column even in a short list. */}
                      <span className="shrink-0 tabular-nums text-caption text-text-secondary">{Math.ceil(f.size / 1024)} KB</span>
                      <button
                        type="button"
                        onClick={() => setStaged((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove ${f.fileName}`}
                        className="shrink-0 rounded p-1 text-text-secondary hover:bg-surface hover:text-error-text"
                      >
                        <X size={14} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button type="button" onClick={() => { void submit(false); }} className="btn-neutral">
                Save draft
              </button>
              <button type="button" onClick={() => { void submit(true); }} className="btn-primary">
                Submit ticket
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * A labelled form control with its accessibility wiring attached (D04 #25).
 *
 * Two defects lived here. (1) The required marker was a bare `*` with `aria-hidden` — so a
 * screen-reader user was told the label and NOTHING about the field being mandatory, then had
 * their submit rejected for a reason they were never given. (2) Validation errors were a single
 * page-level string naming a field ("Field \"Amount\" is required.") with no programmatic link to
 * the input, so AT could not move the user to the field that was wrong.
 *
 * The wiring lives HERE, on the one component every field goes through, rather than at ~8 call
 * sites where the next new field would simply forget it. `cloneElement` injects `id`,
 * `aria-required`, `aria-invalid` and `aria-describedby` onto the control so a caller cannot get
 * it wrong by omission.
 */
function Field({
  label,
  required,
  error,
  help,
  children,
  after,
}: {
  label: string;
  required?: boolean;
  error?: string;
  help?: string;
  children: ReactElement;
  after?: ReactNode;
}) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [helpId, errId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="block">
      <label htmlFor={id} className="mb-1 block text-label text-text">
        {label}
        {required && (
          <>
            <span className="text-error" aria-hidden>
              {' '}
              *
            </span>
            {/* The asterisk is decoration; THIS is what a screen reader hears. */}
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>
      {cloneElement(children, {
        id,
        'aria-required': required || undefined,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      } as Partial<unknown>)}
      {/* Rendered AFTER the control and outside `cloneElement`. Anything extra must arrive this
          way rather than as a second child: wrapping the control in a fragment would send the
          injected `id` to the fragment, leaving the <label htmlFor> pointing at nothing. */}
      {after}
      {help && (
        <span id={helpId} className="mt-1 block text-caption text-text-muted">
          {help}
        </span>
      )}
      {error && (
        <span id={errId} className="mt-1 block text-caption text-error-text">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * FieldType → HTML input type. A lookup rather than the nested ternary this replaced: that chain
 * already handled four cases and adding `email`/`tel` to it would have made the next addition
 * worse again. Anything unmapped falls back to `text`, so a new FieldType renders sanely.
 */
const INPUT_TYPE: Partial<Record<FieldType, string>> = {
  money: 'number',
  number: 'number',
  date: 'date',
  url: 'url',
  email: 'email',
  tel: 'tel',
};

/** Lets the browser offer the user's own saved details — nothing is captured or transmitted. */
const AUTOCOMPLETE: Partial<Record<FieldType, string>> = { email: 'email', tel: 'tel' };

function DynamicField({ field, value, onChange, error }: { field: FieldDefinition; value: string; onChange: (v: string) => void; error?: string }) {
  const common = 'input';
  const na = value === NOT_APPLICABLE;
  const naId = useId();
  return (
    <Field
      label={field.label}
      required={field.required}
      {...(field.help ? { help: field.help } : {})}
      {...(error ? { error } : {})}
      {...(field.notApplicable
        ? {
            /**
             * The Not-applicable tickbox (C36). A real `<input type="checkbox">` with its own
             * `<label htmlFor>`, so it is reachable by Tab and toggled by Space like any
             * checkbox — this must never become a clickable `<span>`.
             *
             * Untick restores an EMPTY field, not the previous number: the requester said no
             * amount applies, so silently resurrecting a disowned figure would put it back into
             * a payment request.
             */
            after: (
              <span className="mt-1.5 flex items-center gap-2">
                <input
                  id={naId}
                  type="checkbox"
                  checked={na}
                  onChange={(e) => onChange(e.target.checked ? NOT_APPLICABLE : '')}
                  className="h-4 w-4 rounded border-border-strong accent-primary"
                />
                <label htmlFor={naId} className="text-body-sm text-text-secondary">
                  Not applicable
                </label>
              </span>
            ),
          }
        : {})}
    >
      {/* `min-h-[64px]` is arbitrary by intent — see the note on the Description field above. */}
      {field.type === 'longtext' ? (
        <textarea className={`${common} min-h-[64px]`} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === 'select' ? (
        <select className={common} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          className={common}
          type={INPUT_TYPE[field.type] ?? 'text'}
          {...(AUTOCOMPLETE[field.type] ? { autoComplete: AUTOCOMPLETE[field.type] } : {})}
          // Ticked = the field is answered "none", so entry is closed rather than merely ignored.
          // Leaving it editable would let a number sit behind an N/A and never be shown.
          disabled={na}
          value={na ? '' : value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}
