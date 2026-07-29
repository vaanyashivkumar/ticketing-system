/**
 * StorageAdapter — the only module that touches localStorage for BUSINESS/DOMAIN data
 * (FRONTEND_ARCHITECTURE §A5). Tickets, session, audit, notifications and config all go
 * through here, so swapping in an HTTP/API adapter later touches nothing above this line.
 * Keys are namespaced per domain (P12 §13 / §18 localStorage schema).
 *
 * ONE DELIBERATE EXCEPTION (ARCH-001): ThemeProvider writes `tps.theme` directly. That is
 * correct and must stay that way — theme is device-local UI state, and routing it through
 * this adapter would sync it to the server the day this becomes an HttpAdapter. The scope
 * of the rule is business data, not "all localStorage".
 *
 * This header previously claimed to be "the ONLY module that touches localStorage" full
 * stop. That was false, and the P18 documentation set inherited the error verbatim before
 * a grep disproved it. An invariant is a claim; the tree is the evidence.
 */

const NS = 'tps';
const key = (domain: string): string => `${NS}.${domain}`;

export const StorageAdapter = {
  read<T>(domain: string): T | null {
    try {
      const raw = localStorage.getItem(key(domain));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      console.error(`[StorageAdapter] read failed for "${domain}"`, err);
      return null;
    }
  },

  /**
   * Persist a domain. Returns whether it actually persisted (defect ST-001).
   *
   * This used to swallow the error — `catch` → `console.error` → `return void` — so a caller
   * could not tell a successful write from a failed one. The consequence was silent data loss:
   * on a quota error `TicketRepository.save()` appeared to succeed, the service returned ok(),
   * the UI reported success, and NOTHING was persisted. Worse, this serialises the whole
   * collection, so one failure discarded every change in that write, not just the new one.
   *
   * The failure is real and reachable: attachments are base64 `data:` URLs living in
   * localStorage against a ~5 MB origin quota.
   *
   * A future HttpAdapter MUST keep this contract and report failure — see BACKEND_HANDOFF.md.
   */
  write<T>(domain: string, value: T): boolean {
    try {
      localStorage.setItem(key(domain), JSON.stringify(value));
      return true;
    } catch (err) {
      console.error(`[StorageAdapter] write failed for "${domain}"`, err);
      return false;
    }
  },

  remove(domain: string): void {
    localStorage.removeItem(key(domain));
  },

  /** Append to a bounded array log (used by the audit trail). Reports persistence like write(). */
  append<T>(domain: string, entry: T, cap = 500): boolean {
    const existing = StorageAdapter.read<T[]>(domain) ?? [];
    existing.push(entry);
    return StorageAdapter.write(domain, existing.slice(-cap));
  },
};
