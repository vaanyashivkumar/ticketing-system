import { useState, useEffect, type ChangeEvent } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Paperclip, Send } from 'lucide-react';
import { InlineError } from '@components/common/InlineError';
import { LiveRegion } from '@components/common/LiveRegion';
import { useAuth } from '@hooks/useAuth';
import { useTicketStore } from '@stores/ticketStore';
import { permittedTransitions, requiredNoteGuard } from '@domain/workflow/workflowEngine';
import type { TransitionDef } from '@config/statusTransitions.config';
import { canOnTicket, authViewOf } from '@domain/permission/can';
import { DEPARTMENTS } from '@config/departments.config';
import { categoryById } from '@domain/routing/routingEngine';
import { StatusBadge, PriorityBadge, SlaBadge } from './components/TicketBadges';
import type { Priority } from '@domain/types/ticket.types';
import { canChangePriority, isAssignable } from '@domain/workflow/statusEngine';
import { eligibleCandidates, suggestedAssignee } from '@domain/workflow/assignmentEngine';
import { priorityLabel, priorityDef, SELECTABLE_PRIORITIES } from '@domain/workflow/priorityEngine';
import { ATTACHMENT_LIMITS } from '@config/attachments.config';
import { UserService } from '@services/userService';

const ACTION_LABEL: Record<string, string> = {
  Submit: 'Submit', Discard: 'Discard draft', Assign: 'Assign', Reject: 'Reject',
  Cancel: 'Cancel', Start: 'Start work', RequestInformation: 'Request information',
  ProvideInformation: 'Provide information', Resolve: 'Resolve', Close: 'Accept & close',
  Reopen: 'Reopen', Resume: 'Resume',
};
const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export function TicketDetailsPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const { session, user } = useAuth();
  const tickets = useTicketStore((s) => s.tickets);
  const commit = useTicketStore((s) => s.commit);
  const comment = useTicketStore((s) => s.comment);
  const attach = useTicketStore((s) => s.attach);
  const reassign = useTicketStore((s) => s.reassign);
  const changePriority = useTicketStore((s) => s.changePriority);
  const allTickets = useTicketStore((s) => s.tickets);
  const fetchOne = useTicketStore((s) => s.fetchOne);
  const ticket = tickets.find((t) => t.id === id);

  /**
   * Fetch the FULL ticket on mount.
   *
   * The list endpoint omits comments, attachments and the activity trail to keep the payload
   * small, so a ticket reached from a list has empty arrays for all three. Rendering that as-is
   * would show "No comments yet" and an empty timeline on a ticket that has both — a silent lie
   * rather than a visible error. In prototype mode this is a no-op read of the mirror.
   */
  useEffect(() => {
    if (id) void fetchOne(id);
  }, [id, fetchOne]);

  const [commentText, setCommentText] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** The action awaiting its mandatory reason/note, if any (BR-038/041/045/047/050). */
  const [pending, setPending] = useState<TransitionDef | null>(null);
  const [noteText, setNoteText] = useState('');
  /** D04 #24: successes were silent to AT — only failures were announced. */
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState('');

  if (!ticket || !session || !user) {
    return <NotFound />;
  }

  // Visibility: source dept + destination dept + sysadmin only.
  // Ask the Permission Engine — never re-derive the rule here. (This replaced a hand-rolled
  // department-code comparison that was a third parallel copy of the same rule.)
  if (!canOnTicket(session, 'VIEW_TICKET', authViewOf(ticket))) return <NotParty />;

  // The same conjunction the service enforces, so the buttons cannot promise what the
  // chokepoint would refuse.
  const actions = permittedTransitions(session, ticket);
  // Re-assignment is the destination department's right; the status window comes from the
  // Status Engine, not from a fourth hand-copied array.
  const canReassign =
    canOnTicket(session, 'REASSIGN_TICKET', authViewOf(ticket)) && isAssignable(ticket.status);
  // BR-060: the requester owns priority while it is a draft, the destination (or a sysadmin)
  // after submission. Both halves are the Permission Engine's answer, never a role-name check.
  const canRegrade =
    canOnTicket(session, 'CHANGE_PRIORITY', authViewOf(ticket)) && canChangePriority(ticket.status);
  /**
   * Candidates for BOTH assignment and re-assignment. The engine's eligibility rule (active
   * members of the destination department) is applied in one place rather than re-filtered at
   * each control, so the two lists cannot disagree about who is allowed to hold a ticket.
   */
  const candidates = eligibleCandidates(UserService.all(), ticket.toDeptCode);
  const suggestion = suggestedAssignee(UserService.all(), ticket.toDeptCode, allTickets, {
    id: user.id,
    name: user.name,
  });
  const teammates = canReassign ? candidates : [];
  const cat = categoryById(ticket.fromDeptCode, ticket.toDeptCode, ticket.categoryId);

  // Where the user actually came from, not an assumption about it.
  const from = (location.state as { from?: string } | null)?.from;
  const cameFromQueue = from === '/app/queue' || (!from && ticket.createdById !== user.id);
  const backTo = cameFromQueue ? '/app/queue' : '/app/tickets';
  const backLabel = cameFromQueue ? 'Department Queue' : 'My Tickets';

  const run = async (def: TransitionDef, note?: string, assignTo?: { id: string; name: string }) => {
    setError(null);
    /**
     * Assign used to be hardcoded to `{ id: user.id }` — self-assignment was the ONLY outcome.
     * A destination triaging its queue could not hand a ticket to the colleague who owns that
     * subject; it had to take it and then re-assign, recording two audit entries for one
     * decision. The Assignment Engine now supplies the DEFAULT and the picker supplies the
     * choice; `suggestedAssignee` falls back to the acting user, so the old behaviour survives
     * as a starting point rather than as a constraint.
     */
    const assignee = def.action === 'Assign' ? (assignTo ?? suggestion) : undefined;
    const r = await commit(ticket.id, def.action, session, assignee, note);
    if (!r.ok) return setError(r.error);
    // The badge flipping is the sighted confirmation; this is the only one AT users get.
    setAnnouncement(`${ACTION_LABEL[def.action] ?? def.action} done. Ticket is now ${def.to}.`);
    setPending(null);
    setNoteText('');
  };

  /** Actions carrying a mandatory-text guard, or a choice to make, open a panel first. */
  const doAction = (def: TransitionDef) => {
    setError(null);
    if (def.action === 'Assign') {
      setAssignTo(suggestion.id);
      setPending(def);
      return;
    }
    if (requiredNoteGuard(def)) {
      setNoteText('');
      setPending(def);
      return;
    }
    run(def);
  };

  const submitComment = async () => {
    if (!commentText.trim()) return;
    const r = await comment(ticket.id, commentText, session);
    if (r.ok) {
      setCommentText('');
      setAnnouncement('Comment added.');
    } else setError(r.error);
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const r = await attach(ticket.id, { fileName: file.name, contentType: file.type, size: file.size, dataUrl: String(reader.result) }, session);
      if (!r.ok) setError(r.error);
      else setAnnouncement(`${file.name} attached.`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Left-anchored, not centered: every page shares one content left edge with the breadcrumbs
  // and header. max-w constrains line length only.
  return (
    <section className="max-w-4xl">
      {/* D04 #10: this was hardcoded to My Tickets, so a destination member who opened a ticket
          from their queue — the core assign/resolve journey — was sent somewhere they had never
          been. Go back where they actually came from. */}
      <Link to={backTo} className="mb-4 inline-flex items-center gap-1 text-body-sm text-text-secondary hover:text-text">
        <ArrowLeft size={14} aria-hidden /> Back to {backLabel}
      </Link>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="font-mono text-body-sm text-text-muted">{ticket.code || 'Draft'}</span>
        <h1 className="text-h2 text-text">{ticket.subject}</h1>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
        {ticket.status !== 'Draft' && <SlaBadge flag={ticket.sla.flag} />}
        <span className="text-body-sm text-text-secondary">
          {DEPARTMENTS[ticket.fromDeptCode].name} → {DEPARTMENTS[ticket.toDeptCode].name} · {ticket.categoryLabel}
        </span>
      </div>

      <InlineError message={error} className="mb-4" />
      <LiveRegion message={announcement} />

      {/* Re-assignment (D04 #2/#8). A non-status audited write (BDM §1118) — it moves the ticket
          without touching the SLA clock, which is why it is not one of the 23 edges. The Roles
          page advertised this capability while it existed nowhere, and every "Assign" was
          hardcoded self-assignment: a ticket held by someone on leave could only be Rejected. */}
      {canReassign && teammates.length > 0 && (
        <div className="card mb-5 flex flex-wrap items-center gap-2 p-3">
          <label htmlFor="reassign" className="text-label text-text">
            Assigned to
          </label>
          <select
            id="reassign"
            value={ticket.assignedToId ?? ''}
            onChange={async (e) => {
              const next = teammates.find((m) => m.id === e.target.value);
              if (!next) return;
              setError(null);
              const r = await reassign(ticket.id, { id: next.id, name: next.name }, session);
              if (!r.ok) setError(r.error);
              else setAnnouncement(`Re-assigned to ${next.name}.`);
            }}
            className="input w-auto bg-surface-sunken px-2 py-1.5"
          >
            {!ticket.assignedToId && <option value="">Unassigned</option>}
            {teammates.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.id === user.id ? ' (you)' : ''}
              </option>
            ))}
          </select>
          <span className="text-caption text-text-muted">Moving the ticket does not restart its SLA clock.</span>
        </div>
      )}

      {/* Priority re-grade — BR-060, the SECOND non-status audited write (BDM §1118), and one
          that was specified from the first requirements document and built nowhere. Priority sets
          the SLA target, so a request mis-filed as Low carried an 80-business-hour target that
          the department receiving it could see was wrong and had no way to correct.

          Unlike re-assignment this DOES move the clock — re-derived from the ORIGINAL anchor, so
          re-grading never hands a late ticket a fresh window. The caption says so, because a
          control that silently changes a deadline is a control people learn not to trust. */}
      {canRegrade && (
        <div className="card mb-5 flex flex-wrap items-center gap-2 p-3">
          <label htmlFor="priority" className="text-label text-text">
            Priority
          </label>
          <select
            id="priority"
            value={ticket.priority}
            onChange={async (e) => {
              const next = e.target.value as Priority;
              if (next === ticket.priority) return;
              setError(null);
              const r = await changePriority(ticket.id, next, session);
              if (!r.ok) setError(r.error);
              else setAnnouncement(`Priority changed to ${priorityLabel(next)}. The resolution target has moved.`);
            }}
            className="input w-auto bg-surface-sunken px-2 py-1.5"
          >
            {SELECTABLE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {priorityLabel(p)}
              </option>
            ))}
          </select>
          <span className="text-caption text-text-muted">
            {priorityDef(ticket.priority).description} Changing this moves the resolution target, measured from
            when the ticket was submitted.
          </span>
        </div>
      )}

      {actions.length > 0 && (
        <div className="card mb-5 p-3">
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <button
                key={a.action}
                type="button"
                onClick={() => doAction(a)}
                aria-expanded={pending?.action === a.action}
                className="btn-neutral"
              >
                {ACTION_LABEL[a.action] ?? a.action}
              </button>
            ))}
          </div>

          {/* Mandatory reason/note (BR-038/041/045/047/050). The service refuses the transition
              without it — this panel exists so the user can satisfy the rule, not to enforce it. */}
          {/* Assign opens a PICKER rather than firing, so the destination chooses a person.
              It defaults to the Assignment Engine's suggestion — currently the least-loaded
              eligible colleague — and to the acting user if the policy makes no suggestion. */}
          {pending?.action === 'Assign' && (
            <div className="mt-3 border-t border-border pt-3">
              <label htmlFor="assign-to" className="block text-label text-text">
                Assign to
              </label>
              <select
                id="assign-to"
                autoFocus
                value={assignTo}
                onChange={(e) => setAssignTo(e.target.value)}
                className="input mt-1 max-w-sm bg-surface-sunken"
              >
                {candidates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.id === user.id ? ' (you)' : ''}
                    {m.id === suggestion.id && m.id !== user.id ? ' — suggested' : ''}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const picked = candidates.find((m) => m.id === assignTo);
                    run(pending, undefined, picked ? { id: picked.id, name: picked.name } : undefined);
                  }}
                  className="btn-primary"
                >
                  Confirm assignment
                </button>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className="btn-neutral"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {pending && requiredNoteGuard(pending) && (
            <div className="mt-3 border-t border-border pt-3">
              <label htmlFor="txn-note" className="block text-label text-text">
                {requiredNoteGuard(pending) === 'resolutionNoteRequired'
                  ? 'Resolution note — the requester reads this to decide whether to accept or reopen'
                  : requiredNoteGuard(pending) === 'questionRequired'
                    ? pending.action === 'RequestInformation'
                      ? 'What do you need from the requester? The SLA clock pauses until they answer.'
                      : 'Your answer — this restarts the SLA clock'
                    : `Reason for "${ACTION_LABEL[pending.action] ?? pending.action}"`}
                <span className="text-error"> *</span>
              </label>
              <textarea
                id="txn-note"
                autoFocus
                rows={3}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="input mt-1 bg-surface-sunken"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={!noteText.trim()}
                  onClick={() => run(pending, noteText)}
                  className="btn-primary"
                >
                  Confirm {ACTION_LABEL[pending.action] ?? pending.action}
                </button>
                <button
                  type="button"
                  onClick={() => { setPending(null); setNoteText(''); }}
                  className="btn-neutral"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Closure evidence — the reason two-step closure exists. A requester must never be asked
          to accept or reopen a resolution they cannot read (BDM §594-595). */}
      {/* The standard surface re-coloured by intent — the border and fill utilities override
          `card`'s neutral pair, so radius and structure stay one decision. */}
      {(ticket.resolutionNote || ticket.rejectionReason) && (
        <div
          className={`card mb-5 p-3 ${ticket.rejectionReason ? 'border-error bg-error-bg' : 'border-success bg-success-bg'}`}
        >
          <h2 className={`text-label uppercase ${ticket.rejectionReason ? 'text-error-text' : 'text-success-text'}`}>
            {ticket.rejectionReason ? 'Reason for rejection' : 'Resolution note'}
          </h2>
          <p className="mt-1 whitespace-pre-wrap break-words text-body text-text">
            {ticket.rejectionReason ?? ticket.resolutionNote}
          </p>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        <div className="space-y-5 md:col-span-2">
          <Panel title="Description">
            <p className="whitespace-pre-wrap text-body text-text">{ticket.description}</p>
          </Panel>

          {cat && (
            <Panel title={`${ticket.categoryLabel} details`}>
              {/* D04 #26: single column below sm, and break long values — category field sets include
                  url types (docLink, report link) that otherwise overflow the card unreadably. */}
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-body-sm sm:grid-cols-2">
                {cat.fields.map((f) => (
                  <div key={f.key}>
                    <dt className="text-text-muted">{f.label}</dt>
                    <dd className="break-words text-text">{String(ticket.categoryData[f.key] ?? '—') || '—'}</dd>
                  </div>
                ))}
                {/**
                 * Values whose field DEFINITION no longer exists (C32).
                 *
                 * This panel renders the definitions, not the data, so retiring a field silently
                 * hid every historical value stored under it — a ticket that recorded a payment
                 * reference would simply stop showing it, with nothing to say it ever had one.
                 * The data was never deleted; it just became unreachable. A ticket is a record,
                 * and a record must not quietly lose what it was created with.
                 */}
                {Object.keys(ticket.categoryData)
                  .filter((k) => !cat.fields.some((f) => f.key === k))
                  .filter((k) => String(ticket.categoryData[k] ?? '').trim() !== '')
                  .map((k) => (
                    <div key={k}>
                      <dt className="text-text-muted">
                        {k} <span className="text-caption">(retired field)</span>
                      </dt>
                      <dd className="break-words text-text">{String(ticket.categoryData[k])}</dd>
                    </div>
                  ))}
              </dl>
            </Panel>
          )}

          <Panel title={`Comments (${ticket.comments.length})`}>
            <div className="space-y-3">
              {ticket.comments.map((c) => (
                <div key={c.id} className="rounded-md bg-surface-sunken p-3">
                  <div className="mb-1 flex items-center justify-between text-caption text-text-muted">
                    <span className="text-body-sm font-medium text-text">{c.authorName}</span>
                    <span>{fmt(c.at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-body-sm text-text">{c.body}</p>
                </div>
              ))}
              {ticket.comments.length === 0 && <p className="text-body-sm text-text-muted">No comments yet.</p>}
              {/**
               * A11Y-002 — the Send button had NO accessible name: icon-only, icon `aria-hidden`,
               * no label, so screen readers announced a bare "button". The placeholder was also the
               * input's only label, and a placeholder is not a label — it disappears the moment the
               * field has content, exactly when someone tabbing back needs to know what it is.
               */}
              <div className="flex gap-2">
                <label htmlFor="comment-input" className="sr-only">
                  Add a comment
                </label>
                <input
                  id="comment-input"
                  className="input"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment…"
                  onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                />
                <button
                  type="button"
                  onClick={submitComment}
                  aria-label="Send comment"
                  className="btn-primary"
                >
                  <Send size={15} aria-hidden />
                </button>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Details">
            <dl className="space-y-2 text-body-sm">
              <Row label="Requester" value={ticket.createdByName} />
              <Row label="Assignee" value={ticket.assignedToName ?? 'Unassigned'} />
              <Row label="Created" value={fmt(ticket.createdAt)} />
              {ticket.sla.dueAt && <Row label="SLA due" value={fmt(ticket.sla.dueAt)} />}
            </dl>
          </Panel>

          <Panel title={`Attachments (${ticket.attachments.length})`}>
            <ul className="space-y-1 text-body-sm">
              {ticket.attachments.map((a) => (
                <li key={a.id}>
                  <a href={a.dataUrl} download={a.fileName} className="inline-flex items-center gap-1 text-primary-text hover:underline">
                    <Paperclip size={13} aria-hidden /> {a.fileName}
                  </a>
                  <span className="ml-1 text-caption text-text-muted">({Math.ceil(a.size / 1024)} KB)</span>
                </li>
              ))}
              {ticket.attachments.length === 0 && <li className="text-text-muted">None</li>}
            </ul>
            {ticket.attachments.length < 3 && (
              <label className="mt-2 inline-flex cursor-pointer items-center gap-1 text-body-sm text-primary-text hover:underline">
                <Paperclip size={13} aria-hidden /> Add file (≤1 MB)
                {/* A picker hint only — BR-108 is enforced by the service (D04 #40). */}
                <input type="file" className="hidden" onChange={onFile} accept={ATTACHMENT_LIMITS.acceptAttribute} />
              </label>
            )}
          </Panel>

          <Panel title="Activity">
            <ol className="space-y-2 text-body-sm">
              {[...ticket.activity].reverse().map((a) => (
                <li key={a.id} className="flex flex-col border-l-2 border-border pl-3">
                  <span className="text-text">
                    <span className="font-medium">{a.actorName}</span> · {a.action.replaceAll('_', ' ').toLowerCase()}
                    {/* Two distinct pairs: statuses for a transition, names or priorities for the
                        two non-status audited writes. Rendering one field for both is what made a
                        Submitted -> Assigned transition read as a re-assignment. */}
                    {a.from && a.to && <span className="text-text-muted"> ({a.from} → {a.to})</span>}
                    {a.toValue && (
                      <span className="text-text-muted"> ({a.fromValue ? `${a.fromValue} → ` : ''}{a.toValue})</span>
                    )}
                  </span>
                  <span className="text-caption text-text-muted">{fmt(a.at)}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </section>
  );
}

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="card-p">
    <h2 className="mb-3 text-label uppercase text-text-muted">{title}</h2>
    {children}
  </div>
);
// Created and SLA due sit directly above one another, so their figures are read as a column:
// `tabular-nums` stated locally rather than relied on from the global default.
const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-2"><dt className="text-text-muted">{label}</dt><dd className="text-right tabular-nums text-text">{value}</dd></div>
);
const NotFound = () => (
  <div className="card border-dashed p-10 text-center text-body text-text-muted">Ticket not found.</div>
);
const NotParty = () => (
  <div role="alert" className="card border-warning bg-warning-bg p-6 text-center text-body text-warning-text">
    You are not a party to this ticket, so you cannot view it.
  </div>
);

export default TicketDetailsPage;
