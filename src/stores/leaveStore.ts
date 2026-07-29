import { create } from 'zustand';
import { StorageAdapter } from '@services/storage/localStorageAdapter';
import { USE_API } from '@config/runtime.config';
import { LeaveApi } from '@services/api/leaveApi';
import {
  computeBalance,
  leaveDayCount,
  splitPaidUnpaid,
  firstStageFor,
  nextStageFor,
  canDecide,
} from '@domain/leave/leaveEngine';
import type { LeaveBalance, LeaveRecord, LeaveTypeName } from '@domain/leave/leaveTypes';
import { LEAVE_EMPLOYEES } from '@config/leave.config';

/**
 * LEAVE STORE — dual-mode, like the rest of the app's stores.
 *
 * • API mode (VITE_API_URL set): records are PERSISTED in Postgres via the leave endpoints. The
 *   server is authoritative for the paid/unpaid split and for who may approve; this store fetches
 *   the caller's ledger + approvals, and every write goes to the API and then re-fetches.
 * • localStorage mode: the original self-contained prototype store (domain "leave"), seeded once.
 *
 * The SELECTORS are identical in both modes — they compute over `records` using the same engine
 * and the static join-date/line-manager config, so a component never learns which mode it is in.
 * In API mode `records` = the caller's own ledger PLUS the applications awaiting their decision,
 * which is exactly what `ledgerFor`/`balanceFor`/`pendingFor` need.
 */

const STORAGE_KEY = 'leave';
const todayISO = (): string => new Date().toISOString().slice(0, 10);
const nowISO = (): string => new Date().toISOString();
const joinDateOf = (userId: string): string | null => LEAVE_EMPLOYEES[userId]?.joinDate ?? null;

/** Seed — only for localStorage mode; API mode seeds server-side in prisma/seed.ts. */
function seed(): LeaveRecord[] {
  return [
    {
      id: 'l-seed-1', employeeId: 'u-sal', type: 'Annual',
      startDate: '2024-08-05', endDate: '2024-08-09', requestedDays: 5, paidDays: 5, unpaidDays: 0,
      reason: 'Summer break', status: 'Approved', stage: null,
      createdAt: '2024-07-20T09:00:00.000Z', decidedAt: '2024-07-24T14:00:00.000Z',
      history: [
        { stage: 'MANAGER', actorId: 'u-adm', action: 'Approved', at: '2024-07-21T10:00:00.000Z' },
        { stage: 'HR', actorId: 'u-hr', action: 'Approved', at: '2024-07-22T11:00:00.000Z' },
        { stage: 'MD', actorId: 'u-sys', action: 'Approved', at: '2024-07-24T14:00:00.000Z' },
      ],
    },
    {
      id: 'l-seed-2', employeeId: 'u-sal', type: 'Sick',
      startDate: '2025-02-11', endDate: '2025-02-12', requestedDays: 2, paidDays: 2, unpaidDays: 0,
      reason: 'Flu', status: 'Approved', stage: null,
      createdAt: '2025-02-11T08:00:00.000Z', decidedAt: '2025-02-13T09:00:00.000Z',
      history: [
        { stage: 'MANAGER', actorId: 'u-adm', action: 'Approved', at: '2025-02-11T12:00:00.000Z' },
        { stage: 'HR', actorId: 'u-hr', action: 'Approved', at: '2025-02-12T09:00:00.000Z' },
        { stage: 'MD', actorId: 'u-sys', action: 'Approved', at: '2025-02-13T09:00:00.000Z' },
      ],
    },
    {
      id: 'l-seed-3', employeeId: 'u-sal', type: 'Annual',
      startDate: '2026-09-14', endDate: '2026-09-18', requestedDays: 5, paidDays: 5, unpaidDays: 0,
      reason: 'Family event', status: 'Pending', stage: 'MANAGER',
      createdAt: '2026-07-20T09:00:00.000Z', history: [],
    },
    {
      id: 'l-seed-4', employeeId: 'u-fin-2', type: 'Parental',
      startDate: '2026-08-03', endDate: '2026-08-07', requestedDays: 5, paidDays: 5, unpaidDays: 0,
      reason: 'Childcare', status: 'Pending', stage: 'MANAGER',
      createdAt: '2026-07-22T09:00:00.000Z', history: [],
    },
  ];
}

function loadLocal(): LeaveRecord[] {
  const stored = StorageAdapter.read<LeaveRecord[]>(STORAGE_KEY);
  if (stored) return stored;
  const seeded = seed();
  StorageAdapter.write(STORAGE_KEY, seeded);
  return seeded;
}

/** Merge the caller's own ledger with the applications awaiting them, de-duplicated by id. */
function mergeById(a: LeaveRecord[], b: LeaveRecord[]): LeaveRecord[] {
  const seen = new Map<string, LeaveRecord>();
  for (const r of [...a, ...b]) seen.set(r.id, r);
  return [...seen.values()];
}

interface ApplyInput {
  employeeId: string;
  type: LeaveTypeName;
  startDate: string;
  endDate: string;
  reason?: string;
}

interface LeaveState {
  records: LeaveRecord[];
  loading: boolean;
  loadError: string | null;
  /** Populate the store for the given user. Instant in localStorage mode; a fetch in API mode. */
  load: (userId: string) => Promise<void>;
  apply: (input: ApplyInput) => Promise<LeaveRecord | null>;
  decide: (recordId: string, actorId: string, action: 'Approved' | 'Rejected', note?: string) => Promise<void>;
  cancel: (recordId: string, actorId: string) => Promise<void>;
  balanceFor: (userId: string, asOf?: string) => LeaveBalance;
  ledgerFor: (userId: string) => LeaveRecord[];
  pendingFor: (approverId: string) => LeaveRecord[];
}

export const useLeaveStore = create<LeaveState>((set, get) => ({
  records: USE_API ? [] : loadLocal(),
  loading: USE_API,
  loadError: null,

  load: async () => {
    if (!USE_API) {
      set({ records: loadLocal(), loading: false, loadError: null });
      return;
    }
    set({ loading: true });
    const r = await LeaveApi.overview();
    if (r.ok) set({ records: mergeById(r.value.ledger, r.value.approvals), loading: false, loadError: null });
    else set({ loading: false, loadError: r.error });
  },

  apply: async (input) => {
    if (USE_API) {
      const r = await LeaveApi.apply({
        type: input.type, startDate: input.startDate, endDate: input.endDate,
        ...(input.reason ? { reason: input.reason } : {}),
      });
      if (!r.ok) return null;
      await get().load(input.employeeId);
      return r.value.record;
    }
    // localStorage: compute the split and route to the first stage locally.
    const { records } = get();
    const requestedDays = leaveDayCount(input.startDate, input.endDate);
    const join = joinDateOf(input.employeeId) ?? input.startDate;
    const { available } = computeBalance(join, input.startDate, records, { employeeId: input.employeeId });
    const { paidDays, unpaidDays } = splitPaidUnpaid(input.type, requestedDays, available);
    const stage = firstStageFor(input.employeeId);
    const record: LeaveRecord = {
      id: `l-${Date.now()}-${records.length}`,
      employeeId: input.employeeId, type: input.type,
      startDate: input.startDate, endDate: input.endDate,
      requestedDays, paidDays, unpaidDays,
      ...(input.reason ? { reason: input.reason } : {}),
      status: stage === null ? 'Approved' : 'Pending',
      stage, history: [], createdAt: nowISO(),
      ...(stage === null ? { decidedAt: nowISO() } : {}),
    };
    const next = [...records, record];
    StorageAdapter.write(STORAGE_KEY, next);
    set({ records: next });
    return record;
  },

  decide: async (recordId, actorId, action, note) => {
    if (USE_API) {
      const r = await LeaveApi.decide(recordId, action, note);
      if (r.ok) await get().load(actorId);
      return;
    }
    const { records } = get();
    const next = records.map((r) => {
      if (r.id !== recordId || !canDecide(r, actorId)) return r;
      const history = [...r.history, { stage: r.stage!, actorId, action, at: nowISO(), ...(note ? { note } : {}) }];
      if (action === 'Rejected') {
        return { ...r, status: 'Rejected' as const, stage: null, history, decidedAt: nowISO() };
      }
      const following = nextStageFor(r.employeeId, r.stage!);
      return following === null
        ? { ...r, status: 'Approved' as const, stage: null, history, decidedAt: nowISO() }
        : { ...r, stage: following, history };
    });
    StorageAdapter.write(STORAGE_KEY, next);
    set({ records: next });
  },

  cancel: async (recordId, actorId) => {
    if (USE_API) {
      const r = await LeaveApi.cancel(recordId);
      if (r.ok) await get().load(actorId);
      return;
    }
    const { records } = get();
    const next = records.map((r) =>
      r.id === recordId && r.employeeId === actorId && r.status === 'Pending'
        ? { ...r, status: 'Cancelled' as const, stage: null, decidedAt: nowISO() }
        : r,
    );
    StorageAdapter.write(STORAGE_KEY, next);
    set({ records: next });
  },

  balanceFor: (userId, asOf) => {
    const join = joinDateOf(userId) ?? asOf ?? todayISO();
    return computeBalance(join, asOf ?? todayISO(), get().records, { employeeId: userId });
  },

  ledgerFor: (userId) =>
    get().records
      .filter((r) => r.employeeId === userId)
      .slice()
      .sort((a, b) => b.startDate.localeCompare(a.startDate)),

  pendingFor: (approverId) => get().records.filter((r) => canDecide(r, approverId)),
}));
