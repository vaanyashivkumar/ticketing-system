import type { FieldDefinition, FieldType } from '@domain/types/ticket.types';

/**
 * Category-field FORMAT validation (phase-0 §7 Validation column, C30; US-B054).
 *
 * Why this module exists: phase-0 §7.4 declares the Sales "Contact" field as type `contact` with
 * "valid email or phone", and the prototype built it as `text` with no check at all — the type
 * existed only in the spec. `email` and `tel` had the same gap: they set the input type, which
 * gets you the right mobile keyboard and nothing else. The Create form submits through a handler
 * rather than a native form submit, so browser validation never fires either. `asdf` was a valid
 * email address as far as this system was concerned.
 *
 * PURE domain: no service, no store, no React. `TicketService.create` is the authority and calls
 * this; the Create page calls the same function so an error can be attached to the field it is
 * about. One implementation, two callers — the UI cannot drift from the rule it displays.
 *
 * ---
 * On the deliberate looseness of these patterns. Strict validation here is a trap that harms real
 * users: the "correct" RFC 5322 email grammar is thousands of characters long and still rejects
 * addresses that work, and phone patterns that assume a country format reject legitimate
 * international numbers. Every pattern below is a SHAPE check — it rejects what is obviously not
 * an address or a number, and gets out of the way otherwise. Rejecting a real person's real
 * contact detail is a worse failure than accepting an odd-looking one, because the odd-looking one
 * is still read by a human in Finance who can tell.
 */

/**
 * The stored value meaning "deliberately no value applies" (C36), set by the Not-applicable
 * tickbox on fields declaring `notApplicable`.
 *
 * It is a real stored value, not an empty string, and that is the entire point: on a REQUIRED
 * field an empty value means the requester has not answered yet, while this means they have
 * answered — the answer is "none". A renewal with no fee is then distinguishable from a renewal
 * whose fee nobody has filled in, and Finance knows which ones to chase.
 */
export const NOT_APPLICABLE = 'N/A';

/** A shape check, not RFC 5322: something, an @, something, a dot, something — no spaces. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Digits with the punctuation real phone numbers carry (+ - ( ) space .), at least 7 digits so a
 * stray number is not mistaken for a phone. No country assumptions — "+44 7700 900123",
 * "(020) 7946 0958" and "07700900123" all pass.
 */
const TEL_SHAPE = /^[+()\-.\s\d]+$/;
const TEL_MIN_DIGITS = 7;

function isEmail(v: string): boolean {
  return EMAIL.test(v);
}

function isTel(v: string): boolean {
  return TEL_SHAPE.test(v) && (v.match(/\d/g)?.length ?? 0) >= TEL_MIN_DIGITS;
}

function isUrl(v: string): boolean {
  try {
    const u = new URL(v);
    // A bare "mailto:x" or "javascript:..." parses fine but is not what a link field means.
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Per-type format rules. Types absent from this map have no format rule — `text`, `longtext`,
 * `select`, `date`, `money` and `number` are either free-form or constrained by the control
 * itself. Absence here is deliberate and means "no format check", never "not written yet".
 */
const RULES: Partial<Record<FieldType, { ok: (v: string) => boolean; message: (label: string) => string }>> = {
  email: {
    ok: isEmail,
    message: (label) => `${label} must be an email address, like name@example.com.`,
  },
  tel: {
    ok: isTel,
    message: (label) => `${label} must be a phone number — digits, optionally with + ( ) or spaces.`,
  },
  contact: {
    ok: (v) => isEmail(v) || isTel(v),
    message: (label) => `${label} must be either an email address or a phone number.`,
  },
  url: {
    ok: isUrl,
    message: (label) => `${label} must be a link starting with http:// or https://.`,
  },
};

/**
 * Returns an error message, or null when the value is acceptable.
 *
 * An EMPTY value is always acceptable here: whether a field may be empty is required-ness, which
 * is a separate rule checked by the caller. Conflating the two would make every optional contact
 * field mandatory the moment it gained a format.
 */
export function fieldFormatError(fdef: FieldDefinition, raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  // The N/A sentinel is an answer, not a malformed value — but only where the field actually
  // offers it. Accepting the literal "N/A" on a field that never offered the tickbox would turn
  // a magic string into a way of bypassing every format rule by typing it.
  if (fdef.notApplicable && value === NOT_APPLICABLE) return null;
  const rule = RULES[fdef.type];
  if (!rule) return null;
  return rule.ok(value) ? null : rule.message(fdef.label);
}

/** True when the type carries a format rule — used by tests and docs to enumerate coverage. */
export function hasFormatRule(type: FieldType): boolean {
  return type in RULES;
}
