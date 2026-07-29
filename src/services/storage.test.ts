import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageAdapter } from './storage/localStorageAdapter';
import { TicketService } from './ticketService';
import { TicketRepository } from './ticketRepository';
import { ATTACHMENT_LIMITS } from '@config/attachments.config';
import { MOCK_USERS } from '@config/mockUsers.config';
import type { Session } from '@domain/types/auth.types';

/**
 * ST-001 + BR-107/108/109.
 *
 * StorageAdapter.write used to swallow quota errors (catch → console.error → return void), so a
 * caller could not distinguish a successful write from a failed one. On a full quota
 * TicketRepository.save() "succeeded", the service returned ok(), the UI reported success — and
 * nothing was persisted. Because the whole collection is serialised in one write, the failure
 * discarded every pending change, not just the new record.
 *
 * Reachable, not theoretical: attachments are base64 data: URLs in localStorage against a ~5 MB
 * origin quota. BR-107's 4 MB store budget — the guard that keeps it under quota — was never
 * implemented, and BR-108's type check existed only as a picker hint.
 */
const sales: Session = {
  user: MOCK_USERS.find((u) => u.departmentCode === 'SAL')!,
  authenticatedAt: new Date().toISOString(),
};

const draft = () =>
  TicketService.create(
    {
      toDeptCode: 'FIN',
      categoryId: 'sal-fin-others',
      subject: 'S',
      description: 'D',
      priority: 'Medium',
      categoryData: { nature: 'x' },
    },
    sales,
    true,
  );

const file = (over: Partial<{ fileName: string; contentType: string; size: number; dataUrl: string }> = {}) => ({
  fileName: 'a.pdf',
  contentType: 'application/pdf',
  size: 1000,
  dataUrl: 'data:application/pdf;base64,AAAA',
  ...over,
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('StorageAdapter reports failed writes (ST-001)', () => {
  it('a successful write returns true', () => {
    expect(StorageAdapter.write('probe', { a: 1 })).toBe(true);
  });

  it('THE REGRESSION: a quota failure returns false instead of being swallowed', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    // Previously: logged to console and returned void — indistinguishable from success.
    expect(StorageAdapter.write('probe', { a: 1 })).toBe(false);
  });

  it('append reports failure too — the audit trail must not lie about being written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(StorageAdapter.append('audit', { x: 1 })).toBe(false);
  });
});

describe('The service never reports success on a write that did not happen (ST-001)', () => {
  it('create() FAILS loudly when storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    const r = draft();
    // Before the fix this returned ok() and the UI showed a created ticket that did not exist.
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('NOTHING was saved');
  });

  it('a workflow transition FAILS loudly when storage is full', () => {
    const created = draft();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    const fin: Session = { user: MOCK_USERS.find((u) => u.departmentCode === 'FIN')!, authenticatedAt: '' };
    const r = TicketService.commitAction(created.value.id, 'Assign', fin, { id: fin.user.id, name: fin.user.name });
    expect(r.ok).toBe(false);
  });
});

describe('Attachment pre-write guard (BR-107 / BR-108 / BR-109)', () => {
  const created = () => {
    const r = draft();
    if (!r.ok) throw new Error('setup failed');
    return r.value;
  };

  it('accepts a valid PDF', () => {
    expect(TicketService.addAttachment(created().id, file(), sales).ok).toBe(true);
  });

  it('BR-108: rejects a disallowed type AT THE SERVICE — `accept` is only a picker hint', () => {
    const r = TicketService.addAttachment(created().id, file({ contentType: 'application/zip', fileName: 'x.zip' }), sales);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('PDF, PNG or JPEG');
  });

  it('BR-107: rejects a file over the per-file ceiling', () => {
    const r = TicketService.addAttachment(created().id, file({ size: ATTACHMENT_LIMITS.maxBytesPerFile + 1 }), sales);
    expect(r.ok).toBe(false);
  });

  it('BR-107: rejects the 4th attachment on a ticket', () => {
    const t = created();
    for (let i = 0; i < ATTACHMENT_LIMITS.maxPerTicket; i++) {
      expect(TicketService.addAttachment(t.id, file({ fileName: `f${i}.pdf` }), sales).ok).toBe(true);
    }
    expect(TicketService.addAttachment(t.id, file({ fileName: 'over.pdf' }), sales).ok).toBe(false);
  });

  it('THE MISSING RULE: the store-wide budget is enforced across tickets, not just per ticket', () => {
    const big = ATTACHMENT_LIMITS.maxBytesPerFile; // 1 MB each
    // Fill the budget using several tickets — a per-ticket cap alone could never catch this.
    let added = 0;
    for (let i = 0; added < ATTACHMENT_LIMITS.maxStoreBytes; i++) {
      const t = created();
      for (let j = 0; j < ATTACHMENT_LIMITS.maxPerTicket && added < ATTACHMENT_LIMITS.maxStoreBytes; j++) {
        const r = TicketService.addAttachment(t.id, file({ size: big, fileName: `b${i}${j}.pdf` }), sales);
        if (!r.ok) break;
        added += big;
      }
      if (i > 10) break; // safety
    }
    expect(TicketRepository.attachmentBytes()).toBeLessThanOrEqual(ATTACHMENT_LIMITS.maxStoreBytes);

    const r = TicketService.addAttachment(created().id, file({ size: big, fileName: 'last.pdf' }), sales);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('storage is full');
  });
});
