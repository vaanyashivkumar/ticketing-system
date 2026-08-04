import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * PIN THE MODE. Vitest loads `.env.local`, so on a developer machine with the backend configured
 * `USE_API` is TRUE inside the test run — the suite silently exercises the fetch branch, and on a
 * fresh clone or CI (no `.env.local`) it exercises the other one. This file is specifically about
 * the localStorage branch, so it says so rather than inheriting whatever the machine happens to
 * have. Without this the tests below pass vacuously: the store returns early into `LeaveApi`,
 * the fetch fails in jsdom, and "no notifications were published" looks like a green run.
 */
vi.mock('@config/runtime.config', () => ({
  USE_API: false,
  API_BASE_URL: '',
  TOKEN_STORAGE_KEY: 'tps.apiToken',
}));

import { useLeaveStore } from '@stores/leaveStore';
import { NotificationService } from '@services/notificationService';

/**
 * THE WIRING, in localStorage mode — which is the mode the DEPLOYED public build runs in.
 *
 * `leaveNotifications.test.ts` proves `publishLeave` picks the right recipients, and the API's
 * live checks prove the server path. Neither touched the join between them on the client: that
 * `leaveStore.decide` actually CALLS the notification service, with the path the application
 * really took. A store that quietly published nothing would pass every one of those tests while
 * the deployed site told nobody anything — the same shape as the config-store defect where
 * deleting one line left sixteen sibling tests green.
 *
 * So this drives the real store through a real chain and then asks the real feed.
 */

const SOFIA = 'u-fin-2'; // Finance, reports to James
const JAMES = 'u-fin'; // her line manager
const NADIA = 'u-hr'; // HR
const ROWAN = 'u-md'; // Managing Director

const typesFor = (userId: string) => NotificationService.forUser(userId).map((n) => n.type);
const store = () => useLeaveStore.getState();

/** File an application and walk it to a final decision, returning the record. */
async function fileAndWalk(decisions: readonly ['Approved' | 'Rejected', string][]) {
  const rec = await store().apply({
    employeeId: SOFIA, type: 'Annual',
    startDate: '2027-06-01', endDate: '2027-06-03',
    reason: 'SECRET-MEDICAL-DETAIL',
  });
  for (const [action, actor] of decisions) await store().decide(rec!.id, actor, action);
  return store().ledgerFor(SOFIA).find((r) => r.id === rec!.id)!;
}

beforeEach(async () => {
  localStorage.clear();
  useLeaveStore.setState({ records: [] });
  await store().load(SOFIA);
});

describe('localStorage mode — the outcome travels back the same path', () => {
  it('notifies the REQUESTER, and every approver it passed through, on approval', async () => {
    const rec = await fileAndWalk([['Approved', JAMES], ['Approved', NADIA], ['Approved', ROWAN]]);
    expect(rec.status).toBe('Approved');

    // The requester is the whole point of the return path.
    expect(typesFor(SOFIA)).toContain('LeaveApproved');
    expect(typesFor(NADIA)).toContain('LeaveApproved');
    expect(typesFor(JAMES)).toContain('LeaveApproved');
    // Author suppression — the MD decided it.
    expect(typesFor(ROWAN)).not.toContain('LeaveApproved');
  });

  it('notifies the requester that it was DISapproved, and stops where it stopped', async () => {
    const rec = await fileAndWalk([['Approved', JAMES], ['Rejected', NADIA]]);
    expect(rec.status).toBe('Rejected');

    expect(typesFor(SOFIA)).toContain('LeaveRejected');
    expect(typesFor(JAMES)).toContain('LeaveRejected'); // he approved it; he is owed the outcome
    // It never reached the MD, so the MD is told nothing at all about it.
    expect(NotificationService.forUser(ROWAN)).toHaveLength(0);
  });

  it('carries the leave code and a link to the leave page, and never the reason', async () => {
    const rec = await fileAndWalk([['Approved', JAMES], ['Approved', NADIA], ['Approved', ROWAN]]);
    const note = NotificationService.forUser(SOFIA).find((n) => n.type === 'LeaveApproved')!;

    expect(note.message).toContain(rec.code);
    expect(note.leaveId).toBe(rec.id); // routes to /app/leave rather than a dead ticket link
    expect(note.message).not.toContain('SECRET-MEDICAL-DETAIL');
  });

  it('tells the next approver at every forward hop, one person at a time', async () => {
    const rec = await store().apply({
      employeeId: SOFIA, type: 'Annual', startDate: '2027-07-01', endDate: '2027-07-02',
    });
    // Filed: only the line manager is asked.
    expect(typesFor(JAMES)).toEqual(['LeaveAwaitingApproval']);
    expect(NotificationService.forUser(NADIA)).toHaveLength(0);

    await store().decide(rec!.id, JAMES, 'Approved');
    expect(typesFor(NADIA)).toEqual(['LeaveAwaitingApproval']);
    expect(NotificationService.forUser(ROWAN)).toHaveLength(0);

    await store().decide(rec!.id, NADIA, 'Approved');
    expect(typesFor(ROWAN)).toEqual(['LeaveAwaitingApproval']);
  });
});
