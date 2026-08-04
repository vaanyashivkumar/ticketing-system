import { describe, it, expect, beforeEach } from 'vitest';
import { fieldFormatError, hasFormatRule, NOT_APPLICABLE } from './fieldFormat';
import { ROUTES } from '@config/routes.config';
import { TicketService } from '@services/ticketService';
import { MOCK_USERS } from '@config/mockUsers.config';
import type { Session } from '@domain/types/auth.types';
import type { FieldDefinition, FieldType } from '@domain/types/ticket.types';

/**
 * FIELD FORMAT VALIDATION (phase-0 §7 / C30).
 *
 * The bug these tests exist for: phase-0 §7.4 declared the Sales "Contact" field as type `contact`
 * with "valid email or phone", and the code built it as `text` with no check whatsoever. The type
 * existed in the specification and nowhere else, for five phases, and nothing failed — because
 * nothing asserted that a field's declared type matches the spec, and nothing asserted that a
 * declared type actually does anything.
 *
 * So this file tests two distinct things, and the second is the one that matters:
 *   1. the validators behave;
 *   2. the CONFIG still declares the types the spec says it does (the lockstep test below).
 * A validator that works is worth nothing if no field is wired to it.
 */
const fdef = (type: FieldType, label = 'Contact'): FieldDefinition => ({
  key: 'k',
  label,
  type,
  required: false,
});

describe('fieldFormatError — email', () => {
  it('accepts ordinary addresses', () => {
    for (const v of ['a@b.co', 'aisha.khan@example.test', 'first+tag@sub.domain.org']) {
      expect(fieldFormatError(fdef('email'), v)).toBeNull();
    }
  });

  it('rejects what is plainly not an address', () => {
    for (const v of ['asdf', 'a@b', 'a b@c.com', '@no-local.com', 'no-at-sign.com']) {
      expect(fieldFormatError(fdef('email'), v)).not.toBeNull();
    }
  });

  it('names the field in the message, so the error is attachable', () => {
    expect(fieldFormatError(fdef('email', 'Contact email'), 'asdf')).toContain('Contact email');
  });
});

describe('fieldFormatError — tel', () => {
  it('accepts international and local shapes', () => {
    for (const v of ['+44 7700 900123', '(020) 7946 0958', '07700900123', '020-7946-0958']) {
      expect(fieldFormatError(fdef('tel'), v)).toBeNull();
    }
  });

  it('rejects letters and too-short digit runs', () => {
    for (const v of ['asdf', '12345', 'call me', '+44 CALL NOW']) {
      expect(fieldFormatError(fdef('tel'), v)).not.toBeNull();
    }
  });
});

describe('fieldFormatError — contact (either format)', () => {
  it('accepts an email OR a phone — that is the whole point of the type', () => {
    expect(fieldFormatError(fdef('contact'), 'a@b.co')).toBeNull();
    expect(fieldFormatError(fdef('contact'), '+44 7700 900123')).toBeNull();
  });

  it('rejects a value that is neither', () => {
    expect(fieldFormatError(fdef('contact'), 'ask reception')).not.toBeNull();
  });
});

describe('fieldFormatError — url', () => {
  it('accepts http(s) and rejects other schemes and non-URLs', () => {
    expect(fieldFormatError(fdef('url'), 'https://example.com/x')).toBeNull();
    expect(fieldFormatError(fdef('url'), 'javascript:alert(1)')).not.toBeNull();
    expect(fieldFormatError(fdef('url'), 'not a url')).not.toBeNull();
  });
});

describe('the Not-applicable sentinel (C36)', () => {
  const naField = (type: FieldType): FieldDefinition => ({ ...fdef(type), notApplicable: true });

  it('is accepted on a field that offers the tickbox', () => {
    expect(fieldFormatError(naField('email'), NOT_APPLICABLE)).toBeNull();
    expect(fieldFormatError(naField('money'), NOT_APPLICABLE)).toBeNull();
  });

  /**
   * The bypass this guard exists for: if the literal string were accepted everywhere, anyone could
   * type "N/A" into an email field and walk straight past its format rule. The sentinel is only
   * meaningful where the field declared it.
   */
  it('is NOT a magic string — typing it into a field without the tickbox still fails', () => {
    expect(fieldFormatError(fdef('email'), NOT_APPLICABLE)).not.toBeNull();
    expect(fieldFormatError(fdef('tel'), NOT_APPLICABLE)).not.toBeNull();
  });

  it('satisfies required-ness, because it is an answer rather than an omission', () => {
    // The service's required check is `!String(value).trim()` — the sentinel is non-empty, so a
    // required field marked N/A passes while a blank one still fails. This pins that contract.
    expect(String(NOT_APPLICABLE).trim()).not.toBe('');
  });

  it('both renewal Amount fields offer it, and remain required', () => {
    const renewals = ROUTES.flatMap((r) => r.categories).filter(
      (c) => c.label === 'Tenancy Renewal – Payments' || c.label === 'Licence Renewal',
    );
    /**
     * FOURTEEN, not four. `HR_INBOUND` is fanned out to every department→HR route, so these two
     * categories exist on 6 inbound-HR routes plus HR→Finance. The first version of this test
     * asserted 4 — the number the two screenshots suggested — and failed with "expected 12".
     * Editing a shared `const` at the top of the config reaches much further than it appears to,
     * which is precisely why this count is asserted rather than assumed.
     *
     * It moved 12 → 14 when Operations was ratified as a seventh department: one more source
     * department fanning into HR is two more instances of this pair. Exactly the reach this
     * comment warns about, demonstrated.
     */
    expect(renewals).toHaveLength(14);
    for (const c of renewals) {
      expect(c.fields.find((f) => f.key === 'amount')).toMatchObject({
        type: 'money',
        required: true,
        notApplicable: true,
      });
    }
  });
});

describe('fieldFormatError — empty and unruled types', () => {
  it('treats empty as acceptable: emptiness is required-ness, a separate rule', () => {
    for (const v of ['', '   ', null, undefined]) {
      expect(fieldFormatError(fdef('contact'), v)).toBeNull();
    }
  });

  it('leaves free-form types alone', () => {
    for (const t of ['text', 'longtext', 'select', 'date', 'money', 'number'] as FieldType[]) {
      expect(fieldFormatError(fdef(t), 'anything at all')).toBeNull();
      expect(hasFormatRule(t)).toBe(false);
    }
  });
});

/**
 * THE LOCKSTEP TEST — the one that would have caught the original defect.
 *
 * phase-0 §7.4 declares Sales → Academics "Contact" as type `contact`. Asserting the validator
 * works proves nothing if the field is still wired as `text`, which is exactly how this shipped.
 */
describe('config declares the types the specification declares', () => {
  it('Sales "Contact" is type `contact`, per phase-0 §7.4 — not `text`', () => {
    const sales = ROUTES.flatMap((r) => r.categories).find((c) => c.id === 'aca-sales');
    const contact = sales?.fields.find((f) => f.key === 'contact');
    expect(contact?.type).toBe('contact');
  });

  it('Payment Link carries optional Contact email/number, per phase-0 §7.1 C30', () => {
    const pl = ROUTES.flatMap((r) => r.categories).find((c) => c.id === 'sal-fin-payment-link');
    expect(pl?.fields.find((f) => f.key === 'payerEmail')).toMatchObject({ type: 'email', required: false });
    expect(pl?.fields.find((f) => f.key === 'payerPhone')).toMatchObject({ type: 'tel', required: false });
  });

  /**
   * C32 reshaped Payment Receipt around student identity. It is ONE field set shared by two
   * routes (SAL→FIN and MKT→FIN), so this asserts both — a change made "for the Sales form"
   * silently edits Marketing's too, and that is the kind of reach that should be pinned.
   */
  it('Payment Receipt is student-shaped on BOTH routes, per phase-0 §7.1 C32', () => {
    const receipts = ROUTES.flatMap((r) => r.categories).filter((c) => c.id.endsWith('-payment-receipt'));
    expect(receipts).toHaveLength(2);
    for (const c of receipts) {
      const keys = c.fields.map((f) => f.key);
      expect(keys).toContain('studentName');
      expect(keys).toContain('studentId');
      expect(keys).toContain('amount');
      // Retired by C32 — present here would mean the removal silently regressed.
      expect(keys).not.toContain('reference');
      expect(keys).not.toContain('method');
      expect(c.fields.find((f) => f.key === 'studentName')?.required).toBe(true);
      expect(c.fields.find((f) => f.key === 'studentId')?.required).toBe(false);
    }
  });

  /**
   * C33 reduced Payroll Issue to Issue type alone, across THREE routes. The second assertion is
   * the one that matters: `employeeId` and `payPeriod` survive on other categories (Advance
   * Salary, Loan, and the HR→FIN Payroll category), so a careless removal would have taken those
   * with it. This pins the removal to Payroll Issue and nowhere else.
   */
  it('Payroll Issue is Issue type only, on all three routes, per phase-0 §7.1 C33', () => {
    // Matched on LABEL, not on an id suffix: `hr-fin-payroll` also ends in "-payroll" but is the
    // separate **Payroll** category (HR → Finance) with its own fields, which C33 must not touch.
    // The first version of this test used the suffix, caught four categories, and failed — the
    // test was wrong, not the config, and the near-miss is why this comment exists.
    const payrollIssue = ROUTES.flatMap((r) => r.categories).filter((c) => c.label === 'Payroll Issue');
    expect(payrollIssue).toHaveLength(3);
    for (const c of payrollIssue) {
      expect(c.fields.map((f) => f.key)).toEqual(['issueType']);
      // The option list IS the payload now that it is the only field — pinned to phase-0 §7.1,
      // which the shipped list had silently drifted from (C33).
      expect(c.fields[0]?.options).toEqual([
        'Missing pay',
        'Underpaid',
        'Overpaid',
        'Deduction query',
        'Payslip query',
      ]);
    }
  });

  it('Referral Discount carries the three payment amounts, per phase-0 §7.1 C34', () => {
    const referral = ROUTES.flatMap((r) => r.categories).find((c) => c.id === 'sal-fin-referral');
    for (const key of ['referrerPay', 'refereePay', 'refereeInstalment']) {
      const field = referral?.fields.find((f) => f.key === key);
      expect(field).toMatchObject({ type: 'money', required: false });
    }
    // The pre-existing fields must survive the addition.
    expect(referral?.fields.map((f) => f.key)).toEqual([
      'referrer',
      'referrerPay',
      'referee',
      'refereePay',
      'refereeInstalment',
      'discountPct',
      'amount',
    ]);
  });

  /**
   * C37 made the Academics module categories university-wise. `ACA_MODULE_FIELDS` is shared by
   * Status Module AND Student Module, and `ACADEMICS_INBOUND` is fanned out to every non-ACA,
   * non-FIN department — so the true instance count is asserted here rather than assumed from the
   * two screenshots that prompted the change (the C36 lesson: a shared `const` reaches further
   * than its edit site suggests).
   */
  it('Status Module and Student Module are university-wise, per phase-0 §7.4 C37', () => {
    const modules = ROUTES.flatMap((r) => r.categories).filter(
      (c) => c.label === 'Status Module' || c.label === 'Student Module',
    );
    expect(modules.length).toBeGreaterThan(2); // fanned out across routes, not a single pair
    for (const c of modules) {
      const keys = c.fields.map((f) => f.key);
      expect(keys).toEqual([
        'university', 'studentName', 'contactNumber', 'module', 'specialisation', 'statusRequested',
      ]);
      // Student ID was REPLACED by Student name — still present would mean the swap regressed.
      expect(keys).not.toContain('studentId');
      // Expanded on stakeholder instruction (2026-07-28) and relabelled "Courses/Programmes".
      expect(c.fields.find((f) => f.key === 'module')?.options).toEqual([
        'BBA', 'MBA', 'DBA', 'BSc', 'MSc', 'PhD',
        'BA', 'MA', 'BCom', 'MCom', 'LLB', 'LLM',
        'Diploma', 'Certificate', 'Foundation', 'Others',
      ]);
      expect(c.fields.find((f) => f.key === 'module')?.label).toBe('Courses/Programmes');
      // Contact number is a `tel`, so it inherits C31 format validation for free.
      expect(c.fields.find((f) => f.key === 'contactNumber')).toMatchObject({ type: 'tel', required: false });
    }
  });

  it('Status and Final Documentation gets the same university-wise head, per C38', () => {
    const docs = ROUTES.flatMap((r) => r.categories).filter((c) => c.label === 'Status and Final Documentation');
    expect(docs.length).toBeGreaterThan(0);
    for (const c of docs) {
      const keys = c.fields.map((f) => f.key);
      expect(keys).toEqual([
        'university', 'studentName', 'contactNumber', 'module', 'specialisation',
        'docType', 'docLink', 'requiredBy',
      ]);
      expect(keys).not.toContain('studentId');
      // "Project" added; "Other" must remain LAST — a catch-all above real options gets picked.
      expect(c.fields.find((f) => f.key === 'docType')?.options).toEqual([
        'Final certificate', 'Transcript', 'Completion letter', 'Project', 'Other',
      ]);
      // Still Category C under OQ-25 — the badge must not vanish on a partial instruction.
      expect(c.fields.every((f) => f.provisional)).toBe(true);
    }
  });

  /**
   * The programme list is stakeholder-given and shared by three categories. Asserting it is
   * IDENTICAL everywhere is the guard against the C33 failure mode, where one copy of an option
   * list was edited and the other silently drifted.
   */
  it('every Academics programme list is the same single list (C38)', () => {
    const lists = ROUTES.flatMap((r) => r.categories)
      .filter((c) => ['Status Module', 'Student Module', 'Status and Final Documentation'].includes(c.label))
      .map((c) => c.fields.find((f) => f.key === 'module')?.options);
    expect(lists.length).toBeGreaterThan(0);
    for (const l of lists) {
      expect(l).toEqual([
        'BBA', 'MBA', 'DBA', 'BSc', 'MSc', 'PhD',
        'BA', 'MA', 'BCom', 'MCom', 'LLB', 'LLM',
        'Diploma', 'Certificate', 'Foundation', 'Others',
      ]);
    }
  });

  it('General Academic Queries is university-wise, per C39', () => {
    const gaq = ROUTES.flatMap((r) => r.categories).filter((c) => c.label === 'General Academic Queries');
    expect(gaq.length).toBeGreaterThan(0);
    for (const c of gaq) {
      const keys = c.fields.map((f) => f.key);
      expect(keys).toEqual(['university', 'queryType', 'details', 'studentName', 'contactNumber']);
      expect(keys).not.toContain('studentId');
      // University is the organising dimension, so REQUIRED...
      expect(c.fields.find((f) => f.key === 'university')?.required).toBe(true);
      // ...but the student stays OPTIONAL, as `studentId` was. A general query need not be about
      // one student, and C37/C38's required-ness must not be copied here by reflex.
      expect(c.fields.find((f) => f.key === 'studentName')?.required).toBe(false);
    }
  });

  it('Sales is university-wise, and its `contact` field was NOT duplicated (C40)', () => {
    const sales = ROUTES.flatMap((r) => r.categories).filter((c) => c.label === 'Sales');
    expect(sales.length).toBeGreaterThan(0);
    for (const c of sales) {
      const keys = c.fields.map((f) => f.key);
      expect(keys).toEqual(['university', 'enquiryType', 'prospect', 'programme', 'contact']);
      expect(c.fields.find((f) => f.key === 'university')?.required).toBe(true);
      // C40 added ONLY the university. A `contactNumber` here would mean the C37-C39 treatment was
      // applied by reflex, duplicating the `contact` field that already accepts a phone.
      expect(keys).not.toContain('contactNumber');
      expect(c.fields.find((f) => f.key === 'contact')?.type).toBe('contact');
    }
  });

  it('Academic Status Updates is university-wise with the Hold/Others status list (C41)', () => {
    const asu = ROUTES.flatMap((r) => r.categories).filter((c) => c.label === 'Academic Status Updates');
    expect(asu.length).toBeGreaterThan(0);
    for (const c of asu) {
      const keys = c.fields.map((f) => f.key);
      expect(keys).toEqual([
        'university', 'studentName', 'contactNumber', 'module', 'specialisation',
        'statusRequested', 'details', 'effectiveDate',
      ]);
      expect(keys).not.toContain('studentId');
      expect(c.fields.find((f) => f.key === 'statusRequested')?.options).toEqual([
        'Not started', 'In progress', 'Completed', 'Hold', 'Deferred', 'Others',
      ]);
      // Still Category C under OQ-25 — partial direction is not ratification.
      expect(c.fields.every((f) => f.provisional)).toBe(true);
    }
  });

  /**
   * C42 CLOSED the divergence C41 opened. All three Academics categories carrying
   * `statusRequested` now share one vocabulary, so the key means the same thing wherever a ticket
   * was raised and a report can group by it honestly.
   *
   * This test previously asserted the OPPOSITE — that Status Module and Student Module still said
   * `Failed` — which was correct for exactly one change. It is inverted here deliberately rather
   * than deleted, because the thing worth guarding is not any particular list but the invariant
   * that there is only ONE.
   */
  it('every Academics `statusRequested` shares one vocabulary (C42)', () => {
    const lists = ROUTES.flatMap((r) => r.categories)
      .filter((c) => ['Status Module', 'Student Module', 'Academic Status Updates'].includes(c.label))
      .map((c) => c.fields.find((f) => f.key === 'statusRequested')?.options);
    expect(lists.length).toBeGreaterThan(2);
    for (const l of lists) {
      expect(l).toEqual(['Not started', 'In progress', 'Completed', 'Hold', 'Deferred', 'Others']);
      expect(l).not.toContain('Failed'); // retired by C41/C42
    }
  });

  /**
   * The Finance-bound `Student Status` category also has a `statusRequested` key, with an entirely
   * different vocabulary (Enrolled / Deferred / Withdrawn / …). It is a different question about a
   * different thing and must NOT be swept into the Academics list by a future alignment.
   */
  it('C42 did not touch the Finance `Student Status` vocabulary', () => {
    const ss = ROUTES.flatMap((r) => r.categories).filter((c) => c.label === 'Student Status');
    expect(ss.length).toBeGreaterThan(0);
    for (const c of ss) {
      expect(c.fields.find((f) => f.key === 'statusRequested')?.options).toContain('Enrolled');
    }
  });

  it('C39 left the Finance-bound "General Queries" alone — a different category', () => {
    const finQueries = ROUTES.flatMap((r) => r.categories).filter((c) => c.label === 'General Queries');
    expect(finQueries.length).toBeGreaterThan(0);
    for (const c of finQueries) {
      expect(c.fields.map((f) => f.key)).not.toContain('university');
    }
  });

  it('C37 did NOT strip studentId from the other Academics categories', () => {
    const others = ROUTES.flatMap((r) => r.categories).filter(
      (c) => c.label !== 'Status Module' && c.label !== 'Student Module' && c.fields.some((f) => f.key === 'studentId'),
    );
    expect(others.length).toBeGreaterThan(0);
  });

  it('the separate HR → Finance "Payroll" category is untouched by C33', () => {
    const hrPayroll = ROUTES.flatMap((r) => r.categories).find((c) => c.id === 'hr-fin-payroll');
    expect(hrPayroll?.label).toBe('Payroll');
    expect(hrPayroll?.fields.length).toBeGreaterThan(1);
  });

  it('C33 did NOT strip employeeId/payPeriod from the categories that legitimately keep them', () => {
    const survivors = ROUTES.flatMap((r) => r.categories).filter(
      (c) => c.label !== 'Payroll Issue' && c.fields.some((f) => f.key === 'employeeId' || f.key === 'payPeriod'),
    );
    expect(survivors.length).toBeGreaterThan(0);
  });

  it('every field whose type carries a format rule is reachable — no rule is dead code', () => {
    const typesInUse = new Set(ROUTES.flatMap((r) => r.categories).flatMap((c) => c.fields).map((f) => f.type));
    for (const t of ['email', 'tel', 'contact', 'url'] as FieldType[]) {
      expect(hasFormatRule(t)).toBe(true);
      expect(typesInUse.has(t)).toBe(true);
    }
  });
});

/**
 * The SERVICE is the authority. The Create page runs the same check for per-field errors, but a
 * caller bypassing the UI must still be refused — otherwise the rule is decoration.
 */
describe('TicketService.create enforces format', () => {
  const priya: Session = {
    user: MOCK_USERS.find((u) => u.id === 'u-hafeez')!,
    authenticatedAt: new Date().toISOString(),
  };
  const base = {
    toDeptCode: 'FIN' as const,
    categoryId: 'sal-fin-payment-link',
    subject: 'Payment link',
    description: 'Please issue a link.',
    priority: 'Medium' as const,
  };

  beforeEach(() => localStorage.clear());

  it('rejects a malformed optional email even though the field is not required', () => {
    const r = TicketService.create(
      { ...base, categoryData: { amount: '10', payer: 'A', purpose: 'P', payerEmail: 'asdf' } },
      priya,
      true,
    );
    expect(r.ok).toBe(false);
  });

  it('accepts the same ticket once the email is well-formed', () => {
    const r = TicketService.create(
      { ...base, categoryData: { amount: '10', payer: 'A', purpose: 'P', payerEmail: 'a@b.co' } },
      priya,
      true,
    );
    expect(r.ok).toBe(true);
  });

  it('rejects a malformed value on a DRAFT too — a draft may be incomplete, not malformed', () => {
    const r = TicketService.create(
      { ...base, categoryData: { amount: '10', payer: 'A', purpose: 'P', payerPhone: 'call me' } },
      priya,
      false,
    );
    expect(r.ok).toBe(false);
  });

  it('leaves an EMPTY optional field alone on a draft', () => {
    const r = TicketService.create(
      { ...base, categoryData: { amount: '10', payer: 'A', purpose: 'P' } },
      priya,
      false,
    );
    expect(r.ok).toBe(true);
  });

  /**
   * Documenting behaviour I did not expect and have NOT changed: the service enforces REQUIRED
   * category fields on drafts as well, while the Create page deliberately exempts drafts from
   * required-ness. So "Save draft" with a required field blank is accepted by the UI and refused
   * by the service. That inconsistency pre-dates C30 and is a product decision (is a draft allowed
   * to be incomplete?), not a format bug — pinned here so it cannot be mistaken for intent.
   */
  it('KNOWN INCONSISTENCY: the service requires required fields even on a draft', () => {
    const r = TicketService.create({ ...base, categoryData: {} }, priya, false);
    expect(r.ok).toBe(false);
  });
});
