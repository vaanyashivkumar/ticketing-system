/**
 * Attachment limits as CONFIGURATION (BR-107 / BR-108 / BR-109; BUSINESS_DOMAIN_MODEL §4.4,
 * §267; phase-3 §5.7 `ATTACHMENT_LIMITS`).
 *
 * These were previously hardcoded inside ticketService (`>= 3`, `> 1_048_576`) — business
 * numbers living in a service, the same P01 "never hardcode business rules" violation CFG-001
 * and the P15 §7 SLA fix were about. The store budget and the MIME allow-list were not
 * implemented at all.
 */
export interface AttachmentLimits {
  /** BR-107: per-file ceiling in bytes. */
  readonly maxBytesPerFile: number;
  /** BR-107: maximum files on a single ticket. */
  readonly maxPerTicket: number;
  /**
   * BR-107: total attachment bytes across the WHOLE store.
   *
   * Read as a store-wide budget, not a per-ticket one — per ticket it could never bind
   * (3 × 1 MB = 3 MB < 4 MB), which is the arithmetic contradiction the BRS itself flags as
   * T-11. Store-wide is the only reading under which the number does anything.
   *
   * It also happens to be the load-bearing guard for defect ST-001: attachments are stored as
   * base64 `data:` URLs inside localStorage, and base64 inflates bytes by ~33%, so an
   * unbounded store walks straight into the browser's ~5 MB origin quota.
   */
  readonly maxStoreBytes: number;
  /** BR-108: accepted MIME types. The service enforces this; `accept` is only a picker hint. */
  readonly acceptedMimeTypes: readonly string[];
  /** BR-108: the matching `accept` attribute for the file input. */
  readonly acceptAttribute: string;
}

export const ATTACHMENT_LIMITS: AttachmentLimits = {
  maxBytesPerFile: 1_048_576,
  maxPerTicket: 3,
  maxStoreBytes: 4 * 1_048_576,
  acceptedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
  acceptAttribute: '.pdf,.png,.jpg,.jpeg',
};
