import { describe, it, expect, beforeEach } from 'vitest';
import { attachmentRejection, TicketService } from './ticketService';
import { ATTACHMENT_LIMITS } from '@config/attachments.config';
import { MOCK_USERS } from '@config/mockUsers.config';
import type { Session } from '@domain/types/auth.types';

/**
 * THE ATTACHMENT GUARD (BR-107/108/109, C32).
 *
 * The guard used to live inside `TicketService.attach`, reachable only through an existing ticket.
 * C32 added a drag-and-drop zone to the Create form, where there IS no ticket yet — so the guard
 * was extracted rather than reimplemented. These tests exist because a second copy of a budget
 * check is exactly the kind of duplicate that drifts, and the copy that drifts is always the one
 * standing between a base64 store and the browser's ~5 MB quota (ST-001).
 *
 * The drag-and-drop path also makes the MIME check load-bearing in a way it was not before: a
 * dropped file never passes through the picker, so the `accept` attribute cannot filter it.
 */
const priya: Session = {
  user: MOCK_USERS.find((u) => u.id === 'u-hafeez')!,
  authenticatedAt: new Date().toISOString(),
};

const png = (size: number) => ({ size, contentType: 'image/png' });

beforeEach(() => localStorage.clear());

describe('attachmentRejection', () => {
  it('accepts an ordinary screenshot', () => {
    expect(attachmentRejection(png(200_000), 0)).toBeNull();
  });

  it('rejects a file over the per-file cap', () => {
    expect(attachmentRejection(png(ATTACHMENT_LIMITS.maxBytesPerFile + 1), 0)).not.toBeNull();
  });

  it('rejects once the ticket already holds the maximum', () => {
    expect(attachmentRejection(png(1000), ATTACHMENT_LIMITS.maxPerTicket)).not.toBeNull();
  });

  it('rejects a type outside the allow-list — a dropped file never met `accept`', () => {
    expect(attachmentRejection({ size: 1000, contentType: 'image/gif' }, 0)).not.toBeNull();
    expect(attachmentRejection({ size: 1000, contentType: 'application/zip' }, 0)).not.toBeNull();
  });

  /**
   * The case the `pendingBytes` parameter exists for. Three files that each fit individually can
   * still exceed the store budget together; without this, staging them one by one would let all
   * three look affordable and only fail at write time, after the ticket had been created.
   */
  it('counts files already staged, so a batch is judged on its combined weight', () => {
    const file = 90_000;
    // Headroom SMALLER than the file, so the same file that fits on an empty store does not fit
    // behind what is already staged. (Getting this arithmetic backwards is why the first version
    // of this test passed vacuously — the headroom exceeded the file and nothing was proven.)
    const nearBudget = ATTACHMENT_LIMITS.maxStoreBytes - 50_000;
    expect(attachmentRejection(png(file), 0, 0)).toBeNull();
    expect(attachmentRejection(png(file), 0, nearBudget)).not.toBeNull();
  });
});

describe('the guard is still enforced through TicketService.addAttachment', () => {
  const make = () =>
    TicketService.create(
      {
        toDeptCode: 'FIN',
        categoryId: 'sal-fin-payment-receipt',
        subject: 'Receipt',
        description: 'Attached.',
        priority: 'Medium',
        categoryData: { studentName: 'Sam Doe', amount: '10', paymentDate: '2026-07-01' },
      },
      priya,
      true,
    );

  it('creates the receipt with the C32 field set', () => {
    const r = make();
    expect(r.ok).toBe(true);
  });

  it('refuses a disallowed type at the service, not merely in the picker', () => {
    const created = make();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const r = TicketService.addAttachment(
      created.value.id,
      { fileName: 'x.gif', contentType: 'image/gif', size: 1000, dataUrl: 'data:image/gif;base64,AA' },
      priya,
    );
    expect(r.ok).toBe(false);
  });

  it('accepts a PNG screenshot and records it on the ticket', () => {
    const created = make();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const r = TicketService.addAttachment(
      created.value.id,
      { fileName: 'receipt.png', contentType: 'image/png', size: 2048, dataUrl: 'data:image/png;base64,AA' },
      priya,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.attachments).toHaveLength(1);
    expect(r.value.attachments[0]?.fileName).toBe('receipt.png');
  });
});
