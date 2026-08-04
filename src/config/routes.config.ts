import type { DepartmentCode } from '@domain/types/auth.types';
import type { FieldDefinition, Priority } from '@domain/types/ticket.types';

/**
 * The stakeholder routing matrix as configuration (P13 §2/§3; PROJECT_CONSTITUTION §2.3).
 * 14 concrete routes. Finance is EXCLUDED from the Other→Academics wildcard (it has its own
 * FIN→ACA route). Category field definitions are from phase-0 §7 (the normative source).
 * Categories tagged `provisional` carry ⚠️ C field sets pending OQ-25/OQ-26 ratification.
 */

export interface CategoryConfig {
  readonly id: string;
  readonly label: string;
  readonly defaultPriority: Priority;
  readonly fields: readonly FieldDefinition[];
}

export interface RouteConfig {
  readonly from: DepartmentCode;
  readonly to: DepartmentCode;
  readonly categories: readonly CategoryConfig[];
}

const f = (
  key: string,
  label: string,
  type: FieldDefinition['type'],
  required = true,
  extra: Partial<FieldDefinition> = {},
): FieldDefinition => ({ key, label, type, required, ...extra });

// ---- Reusable field sets (shared categories, defined once) ----
/**
 * (C) STAKEHOLDER-DIRECTED, 2026-07-20 (C32). Reshaped around STUDENT IDENTITY.
 *
 * Removed `reference` (was required) and `method`; added `studentName` / `studentId`. `amount`,
 * `paymentDate` and `payerName` were already here and are unchanged — the request listed "amount"
 * but it already existed, so nothing was duplicated.
 *
 * Shared by BOTH `sal-fin-payment-receipt` and `mkt-fin-payment-receipt`, so this edits the
 * Marketing route as well as Sales. That is intended (one category, two routes, phase-0 M11) —
 * noting it because the request named only the one form.
 *
 * `studentName` is REQUIRED: with `reference` gone, it is the only thing identifying what the
 * receipt is for. Any existing draft without it will now be refused at submit.
 */
const PAYMENT_RECEIPT = [
  f('studentName', 'Student name', 'text'),
  f('studentId', 'Student ID', 'text', false),
  f('amount', 'Amount (GBP)', 'money'),
  f('paymentDate', 'Payment date', 'date'),
  f('payerName', 'Payer name', 'text', false, { help: 'If someone other than the student paid.' }),
];
const GENERAL_QUERIES_FIN = [
  f('queryType', 'Query type', 'select', true, { options: ['Payment', 'Invoice', 'Payroll', 'Statement', 'Other'] }),
  f('details', 'Details', 'longtext'),
];
/**
 * (C) STAKEHOLDER-DIRECTED, 2026-07-20 (C36). Amount on BOTH renewal categories now offers an
 * explicit "Not applicable" tickbox.
 *
 * Amount stays REQUIRED deliberately. The requester must now answer it one way or the other —
 * a figure, or N/A — instead of the previous position where the only escape was to leave a
 * required field blank and be blocked. Making it optional would have been one line, but blank
 * would then mean both "no fee applies" and "nobody filled this in", and Finance would have to
 * chase every renewal to find out which.
 *
 * REACH — larger than it looks, and larger than first assumed. These two field sets appear in
 * `HR_INBOUND`, which line ~333 fans out to EVERY department-to-HR route, plus the two explicit
 * `HR → Finance` entries. That is **12 category instances across 6 routes**, not the two forms the
 * screenshots showed. (Written as "four forms" until a test counted 12 — the fan-out at the bottom
 * of this file is easy to read past when editing a `const` at the top.)
 */
const TENANCY_RENEWAL = [
  f('asset', 'Property / asset', 'text'),
  f('deadline', 'External deadline (renewal date)', 'date', true, { help: 'Drives the SLA due date (deadline − 3 business days).' }),
  f('amount', 'Amount (GBP)', 'money', true, { notApplicable: true }),
  f('counterparty', 'Landlord / counterparty', 'text', false),
];
const LICENCE_RENEWAL = [
  f('asset', 'Licence name', 'text'),
  f('deadline', 'External deadline (renewal date)', 'date', true, { help: 'Drives the SLA due date (deadline − 3 business days).' }),
  f('amount', 'Amount (GBP)', 'money', true, { notApplicable: true }),
  f('authority', 'Issuing authority', 'text', false),
];
/**
 * (C) STAKEHOLDER-DIRECTED, 2026-07-20 (C33). Reduced to Issue type alone: `employeeId` and
 * `payPeriod` (both Req) retired.
 *
 * Shared by THREE routes — `sal-fin-payroll`, `mkt-fin-payroll`, `aca-fin-payroll` — so this edits
 * Marketing's and Academics' forms as well as Sales'. Noting it because the request named one form.
 *
 * Deliberately NOT touched: the separate **Payroll** (HR → Finance), **Advance Salary** and
 * **Loan** categories keep their own Employee ID / Pay period fields. They are different
 * categories that happen to share field names.
 *
 * This leaves the category with a single field. That is legitimate — the base ticket still carries
 * subject, description, priority and attachments — but it does mean the identifying detail now
 * lives in the free-text description rather than in a structured field, which reporting cannot
 * aggregate. Recorded in C33 as a consequence, not a defect.
 */
const PAYROLL_ISSUE = [
  // Option list RATIFIED to phase-0 §7.1's (C33). The code shipped a different four-option list
  // ("Missing payment / Incorrect amount / Deduction query / Other") that had diverged from the
  // spec unnoticed. With Issue type now the only structured field, the list IS the payload, so
  // the divergence stopped being cosmetic. The spec's list distinguishes under- from over-payment
  // and drops the catch-all "Other", which a one-field category cannot afford.
  f('issueType', 'Issue type', 'select', true, {
    options: ['Missing pay', 'Underpaid', 'Overpaid', 'Deduction query', 'Payslip query'],
  }),
];

// ---- Academics-bound categories (6 flat, ratified R1). Two are ⚠️ C (OQ-25/26). ----
/**
 * (C) STAKEHOLDER-DIRECTED, 2026-07-20 (C37). Reshaped to be UNIVERSITY-WISE.
 *
 * Shared by BOTH **Status Module** and **Student Module** — which is what "do the same for status
 * and student module" needs, and why one edit is enough. `ACADEMICS_INBOUND` is then fanned out
 * near the bottom of this file to every non-ACA, non-FIN department, so the real reach is
 * **8 category instances across 4 routes** (SAL/MKT/HR/ADM → Academics), not the two forms on
 * screen. Counted, not estimated, and pinned by a test.
 *
 * Changes: **University name** added (the "university-wise" ask); **Student ID → Student name**;
 * **Contact number** added (`tel`, optional); module options replaced with the six named
 * programmes; **Specialisation** added as FREE TEXT.
 *
 * Specialisation is deliberately not a dropdown: no ratified source lists this organisation's
 * specialisations, and inventing them would be exactly the fabrication PROJECT_CONSTITUTION §
 * hallucination forbids. Stakeholder chose free text over supplying a list. The cost is real and
 * should not be forgotten — free text cannot be aggregated in reporting, and the same
 * specialisation will be spelled several ways.
 */
/**
 * The programme list, defined ONCE (C38). It is stakeholder-given and now appears on three
 * Academics categories — Status Module, Student Module and Status and Final Documentation. Three
 * copies of the same list is three chances for one to be edited and the others missed, which is
 * exactly how the Payroll Issue option list drifted from the specification (C33).
 */
// Expanded on stakeholder instruction (2026-07-28): the original six programmes plus the common
// undergraduate/postgraduate/foundation awards, with `Others` last as the catch-all (same
// convention as ACA_STATUS_OPTIONS below — a catch-all above real options is the one people pick).
const ACA_PROGRAMMES = [
  'BBA', 'MBA', 'DBA', 'BSc', 'MSc', 'PhD',
  'BA', 'MA', 'BCom', 'MCom', 'LLB', 'LLM',
  'Diploma', 'Certificate', 'Foundation', 'Others',
] as const;

/**
 * ONE status vocabulary for the `statusRequested` key, across all three Academics categories that
 * carry it: Status Module, Student Module and Academic Status Updates (C42).
 *
 * C41 changed this list on Academic Status Updates alone, which left `Failed` on two categories
 * and `Hold` on a third — the same field key meaning different things depending on which form
 * raised the ticket, so a report grouping by status would have split one concept into two. C42
 * closes that on stakeholder instruction: the two constants became this one, and there is now no
 * second copy to drift.
 *
 * `Others` stays last — a catch-all listed above real options is the one people pick.
 */
const ACA_STATUS_OPTIONS = ['Not started', 'In progress', 'Completed', 'Hold', 'Deferred', 'Others'] as const;

const ACA_MODULE_FIELDS = [
  f('university', 'University name', 'text'),
  f('studentName', 'Student name', 'text'),
  f('contactNumber', 'Contact number', 'tel', false),
  f('module', 'Courses/Programmes', 'select', true, { options: [...ACA_PROGRAMMES] }),
  f('specialisation', 'Specialisation', 'text', true, { help: 'The programme specialisation, e.g. Finance, Marketing.' }),
  f('statusRequested', 'Status requested', 'select', true, { options: [...ACA_STATUS_OPTIONS] }),
];
const ACADEMICS_INBOUND: readonly CategoryConfig[] = [
  /**
   * (C) STAKEHOLDER-DIRECTED, 2026-07-20 (C40). University-wise, as C37–C39 — but ONLY the
   * university field was added, because the rest of that treatment is already satisfied here:
   * there is no `studentId` to swap (the field is `Prospect / student name`), and `Contact`
   * already exists as the `contact` type — one field accepting an email OR a phone, which is the
   * spec-declared type made real in C31. Adding a second contact field would have duplicated it.
   */
  { id: 'aca-sales', label: 'Sales', defaultPriority: 'Medium', fields: [
    f('university', 'University name', 'text'),
    f('enquiryType', 'Enquiry type', 'select', true, { options: ['New enrolment', 'Upgrade', 'Transfer', 'Refund query', 'Other'] }),
    f('prospect', 'Prospect / student name', 'text'),
    f('programme', 'Programme / course', 'text', false),
    // (A) phase-0 §7.4 declares this `contact` with "valid email or phone". It was built as
    // `text` with no check — the type existed only in the spec (C30). Now genuinely `contact`.
    f('contact', 'Contact', 'contact', false, { help: 'An email address or a phone number.' }),
  ] },
  { id: 'aca-status-module', label: 'Status Module', defaultPriority: 'Medium', fields: ACA_MODULE_FIELDS },
  { id: 'aca-student-module', label: 'Student Module', defaultPriority: 'Medium', fields: ACA_MODULE_FIELDS },
  /**
   * (C) STAKEHOLDER-DIRECTED, 2026-07-20 (C38). The C37 treatment applied here too: university-
   * wise head, Student ID → Student name, Contact number, the six programmes, Specialisation —
   * plus **Project** added to Document type.
   *
   * "Project" sits BEFORE "Other": a catch-all listed above real options invites people to pick it.
   *
   * The whole set stays `provisional: true`. These fields were already Category C under **OQ-25**,
   * which asks for the field definitions to be *ratified* — and this instruction sets some of them
   * (university, student name, contact, programmes, specialisation, the Project option) while
   * saying nothing about `Final document link` or `Required by`. Partial direction is not
   * ratification, so the badge stays and OQ-25 stays open. Dropping it is a stakeholder call.
   */
  { id: 'aca-final-doc', label: 'Status and Final Documentation', defaultPriority: 'Medium', fields: [
    f('university', 'University name', 'text'),
    f('studentName', 'Student name', 'text'),
    f('contactNumber', 'Contact number', 'tel', false),
    f('module', 'Courses/Programmes', 'select', true, { options: [...ACA_PROGRAMMES] }),
    f('specialisation', 'Specialisation', 'text', true, { help: 'The programme specialisation, e.g. Finance, Marketing.' }),
    f('docType', 'Document type', 'select', true, { options: ['Final certificate', 'Transcript', 'Completion letter', 'Project', 'Other'] }),
    f('docLink', 'Final document link', 'url', false),
    f('requiredBy', 'Required by', 'date', false),
  ].map((x) => ({ ...x, provisional: true })) },
  /**
   * (C) STAKEHOLDER-DIRECTED, 2026-07-20 (C39). University-wise, as C37/C38.
   *
   * REQUIRED-NESS DIFFERS FROM C37/C38, deliberately. `studentId` here was **optional** — a
   * general academic query need not concern a particular student — so `studentName` inherits that
   * optionality rather than being promoted to required on the way through. Only **University name**
   * is required, because being university-wise is the point of the change.
   *
   * NOT the Finance-bound `General Queries` (`GENERAL_QUERIES_FIN`), which is a separate category
   * that phase-0 §7.4 explicitly says must not be merged with this one. Untouched, and a test says so.
   */
  { id: 'aca-general-queries', label: 'General Academic Queries', defaultPriority: 'Medium', fields: [
    f('university', 'University name', 'text'),
    f('queryType', 'Query type', 'select', true, { options: ['General query', 'Escalation', 'Other'] }),
    f('details', 'Details', 'longtext'),
    f('studentName', 'Student name', 'text', false),
    f('contactNumber', 'Contact number', 'tel', false),
  ] },
  /**
   * (C) STAKEHOLDER-DIRECTED, 2026-07-20 (C41). The last Academics category to go university-wise,
   * completing the set begun in C37.
   *
   * Status vocabulary: `Failed` → `Hold`, plus `Others`. Introduced here by C41 and extended to
   * Status Module / Student Module by C42, so all three now share `ACA_STATUS_OPTIONS`.
   *
   * Stays `provisional: true` under OQ-25, for the same reason as C38: the instruction sets most
   * fields but not `Details` or `Effective date`, and partial direction is not ratification.
   */
  { id: 'aca-status-updates', label: 'Academic Status Updates', defaultPriority: 'Medium', fields: [
    f('university', 'University name', 'text'),
    f('studentName', 'Student name', 'text'),
    f('contactNumber', 'Contact number', 'tel', false),
    f('module', 'Courses/Programmes', 'select', true, { options: [...ACA_PROGRAMMES] }),
    f('specialisation', 'Specialisation', 'text', true, { help: 'The programme specialisation, e.g. Finance, Marketing.' }),
    f('statusRequested', 'Status requested', 'select', true, { options: [...ACA_STATUS_OPTIONS] }),
    f('details', 'Details', 'longtext', false),
    f('effectiveDate', 'Effective date', 'date', false),
  ].map((x) => ({ ...x, provisional: true })) },
];

// ---- HR-bound categories (→HR from every dept except HR) ----
const HR_INBOUND: readonly CategoryConfig[] = [
  { id: 'hr-leave', label: 'Leave Request', defaultPriority: 'Low', fields: [
    f('leaveType', 'Leave type', 'select', true, { options: ['Annual', 'Sick', 'Unpaid', 'Parental', 'Compassionate', 'Other'] }),
    f('startDate', 'Start date', 'date'),
    f('endDate', 'End date', 'date'),
    f('days', 'Number of days', 'number'),
    f('cover', 'Cover person', 'text', false),
    f('reason', 'Reason', 'longtext', false),
  ] },
  { id: 'hr-early-logout', label: 'Early Logout', defaultPriority: 'Low', fields: [
    f('date', 'Date', 'date'),
    f('time', 'Logout time', 'text', true, { help: 'e.g. 15:30' }),
    f('reason', 'Reason', 'longtext'),
    f('makeUp', 'Expected make-up', 'text', false),
  ] },
  { id: 'hr-tenancy', label: 'Tenancy Renewal – Payments', defaultPriority: 'Medium', fields: TENANCY_RENEWAL },
  { id: 'hr-licence', label: 'Licence Renewal', defaultPriority: 'Medium', fields: LICENCE_RENEWAL },
];

// ---- Route definitions ----
// `OPS` added by the 2026-08-04 ratification. It appears here and therefore inherits the two
// wildcard outbound routes below — which is the whole point: those rows say "other departments",
// and Operations is now one of them. 14 concrete routes becomes 16 (OPS→HR, OPS→ACA).
const CODES: readonly DepartmentCode[] = ['SAL', 'MKT', 'ACA', 'HR', 'FIN', 'ADM', 'OPS'];

export const ROUTES: readonly RouteConfig[] = [
  // Finance-inbound (specific)
  { from: 'SAL', to: 'FIN', categories: [
    // (C) STAKEHOLDER-DIRECTED EXTENSION, 2026-07-20 — `payerEmail` and `payerPhone` are NOT in
    // phase-0 §7.1, which enumerates exactly five fields for this category. Added on explicit
    // instruction so Finance can reach the payer to deliver the link. Both OPTIONAL, so no
    // existing draft or ticket becomes invalid. Grouped with the payer because they describe the
    // same person. phase-0 §7.1 now trails the code and needs reconciling.
    { id: 'sal-fin-payment-link', label: 'Payment Link', defaultPriority: 'Medium', fields: [
      f('amount', 'Amount (GBP)', 'money'),
      f('payer', 'Payer / student name', 'text'),
      f('payerEmail', 'Contact email', 'email', false, { help: 'Where the payment link should be sent.' }),
      f('payerPhone', 'Contact number', 'tel', false),
      f('purpose', 'Purpose', 'text'),
      f('studentId', 'Student ID', 'text', false),
      f('expiry', 'Link expiry', 'date', false),
    ] },
    { id: 'sal-fin-payment-receipt', label: 'Payment Receipt', defaultPriority: 'Medium', fields: PAYMENT_RECEIPT },
    { id: 'sal-fin-student-status', label: 'Student Status', defaultPriority: 'Medium', fields: [
      f('studentId', 'Student ID', 'text'),
      f('studentName', 'Student name', 'text'),
      f('statusRequested', 'Status requested', 'select', true, { options: ['Enrolled', 'Deferred', 'Withdrawn', 'Payment-blocked', 'Graduated'] }),
    ] },
    { id: 'sal-fin-payroll', label: 'Payroll Issue', defaultPriority: 'High', fields: PAYROLL_ISSUE },
    /**
     * (C) STAKEHOLDER-DIRECTED, 2026-07-20 (C34). Added the three referral payment amounts.
     * Each person is grouped with their own pay rather than appending all three at the end, so
     * the form reads referrer → what the referrer gets, referee → what the referee gets/owes.
     *
     * All three are OPTIONAL: a referral is raised when the arrangement is agreed, and the
     * amounts are often settled later. Optional also means no existing draft or ticket is
     * invalidated. Say so if any should be mandatory.
     *
     * "Instalment" is the British spelling, per the phase-0 convention already in force across
     * this config ("Licence Renewal", "authorisation").
     */
    { id: 'sal-fin-referral', label: 'Referral Discount', defaultPriority: 'Medium', fields: [
      f('referrer', 'Referrer', 'text'),
      f('referrerPay', 'Pay of Referrer', 'money', false),
      f('referee', 'Referee / student', 'text'),
      f('refereePay', 'Pay of Referee', 'money', false),
      f('refereeInstalment', 'Instalment amount (Referee)', 'money', false),
      f('discountPct', 'Discount %', 'number'),
      f('amount', 'Amount (GBP)', 'money', false),
    ] },
    /**
     * (C) STAKEHOLDER-DIRECTED, 2026-07-20 (C35). A NEW CATEGORY — a different kind of change
     * from C32–C34, which edited fields inside categories that already existed.
     *
     * PROJECT_CONSTITUTION §2.3 makes the routing matrix immutable: "never redesign, remove,
     * merge or simplify; **extend only with stakeholder approval**". Extension is therefore the
     * one permitted change, and this is it — recorded as such so it is never mistaken for a
     * routine field edit. It also breaks the "use exactly these six" reconciliation in
     * UX_WORKFLOW_BLUEPRINT §category-set, which is updated to seven.
     *
     * Placed BEFORE "Others" so the catch-all stays last in the dropdown.
     *
     * ⚠️ The FIELD SET below is Category C — inferred, not ratified. It mirrors Payroll Issue's
     * original shape (issue type + period + expected amount), that being the nearest ratified
     * analogue: both are a dispute about money owed to a person. Nothing in phase-0 defines an
     * Incentive Issue, so these labels and options need stakeholder confirmation.
     *
     * Priority is Medium, not Payroll Issue's High: an incentive is variable pay rather than
     * statutory salary. Say so if it should be High.
     *
     * SAL → FIN only, as requested. Marketing's route does NOT get this category, even though
     * Marketing staff may also earn incentives — flagged rather than assumed.
     */
    { id: 'sal-fin-incentive', label: 'Incentive Issue', defaultPriority: 'Medium', fields: [
      f('issueType', 'Issue type', 'select', true, {
        options: ['Not paid', 'Incorrect amount', 'Calculation query', 'Deduction query', 'Other'],
      }),
      f('period', 'Incentive period', 'text', true, { help: 'The month or quarter the incentive relates to.' }),
      f('expectedAmount', 'Expected amount (GBP)', 'money', false),
    ] },
    { id: 'sal-fin-others', label: 'Others', defaultPriority: 'Medium', fields: [f('nature', 'Nature of request', 'longtext')] },
  ] },
  { from: 'MKT', to: 'FIN', categories: [
    { id: 'mkt-fin-vendor', label: 'Vendor Payment', defaultPriority: 'Medium', fields: [
      f('vendor', 'Vendor name', 'text'),
      f('invoiceNo', 'Invoice number', 'text'),
      f('invoiceDate', 'Invoice date', 'date'),
      f('amount', 'Amount (GBP)', 'money'),
      f('dueDate', 'Due date', 'date', false),
    ] },
    { id: 'mkt-fin-payment-receipt', label: 'Payment Receipt', defaultPriority: 'Medium', fields: PAYMENT_RECEIPT },
    { id: 'mkt-fin-client-invoice', label: 'Client Invoice', defaultPriority: 'Medium', fields: [
      f('client', 'Client name', 'text'),
      f('invoiceNo', 'Invoice number', 'text'),
      f('amount', 'Amount (GBP)', 'money'),
      f('billingPeriod', 'Billing period', 'text'),
    ] },
    { id: 'mkt-fin-client-receipt', label: 'Client Payment Receipt', defaultPriority: 'Medium', fields: [
      f('client', 'Client name', 'text'),
      f('amount', 'Amount (GBP)', 'money'),
      f('reference', 'Reference', 'text'),
    ] },
    { id: 'mkt-fin-general', label: 'General Queries', defaultPriority: 'Medium', fields: GENERAL_QUERIES_FIN },
    { id: 'mkt-fin-payroll', label: 'Payroll Issue', defaultPriority: 'High', fields: PAYROLL_ISSUE },
    { id: 'mkt-fin-influencer', label: 'Influencer Payments', defaultPriority: 'Medium', fields: [
      f('handle', 'Influencer handle', 'text'),
      f('campaign', 'Campaign', 'text'),
      f('platform', 'Platform', 'select', true, { options: ['Instagram', 'TikTok', 'YouTube', 'X', 'Other'] }),
      f('amount', 'Amount (GBP)', 'money'),
    ] },
  ] },
  { from: 'ACA', to: 'FIN', categories: [
    { id: 'aca-fin-soa', label: 'Statement of Accounts (SOA)', defaultPriority: 'Medium', fields: [
      f('entity', 'Student / entity', 'text'),
      f('programme', 'Programme', 'text', false),
      f('intake', 'Intake', 'text', false),
      f('periodFrom', 'Period from', 'date'),
      f('periodTo', 'Period to', 'date'),
    ] },
    { id: 'aca-fin-report', label: 'Report Approval', defaultPriority: 'Medium', fields: [
      f('reportName', 'Report name', 'text'),
      f('period', 'Period', 'text'),
      f('link', 'Report link', 'url', false),
    ] },
    { id: 'aca-fin-general', label: 'General Queries', defaultPriority: 'Medium', fields: GENERAL_QUERIES_FIN },
    { id: 'aca-fin-payroll', label: 'Payroll Issue', defaultPriority: 'High', fields: PAYROLL_ISSUE },
    { id: 'aca-fin-schedule', label: 'Monthly Schedule List', defaultPriority: 'Medium', fields: [
      f('month', 'Month', 'text'),
      f('team', 'Team / department', 'text'),
    ] },
  ] },
  { from: 'HR', to: 'FIN', categories: [
    { id: 'hr-fin-payroll', label: 'Payroll', defaultPriority: 'High', fields: [
      f('employeeId', 'Employee ID', 'text'),
      f('payPeriod', 'Pay period', 'text'),
      f('amount', 'Amount (GBP)', 'money', false),
    ] },
    { id: 'hr-fin-advance', label: 'Advance Salary', defaultPriority: 'High', fields: [
      f('employeeId', 'Employee ID', 'text'),
      f('amount', 'Amount requested (GBP)', 'money'),
      f('repayMonths', 'Repayment months', 'number'),
      f('reason', 'Reason', 'longtext'),
    ] },
    { id: 'hr-fin-general', label: 'General Queries', defaultPriority: 'Medium', fields: GENERAL_QUERIES_FIN },
    { id: 'hr-fin-loan', label: 'Loan', defaultPriority: 'Medium', fields: [
      f('employeeId', 'Employee ID', 'text'),
      f('amount', 'Loan amount (GBP)', 'money'),
      f('tenure', 'Tenure (months)', 'number'),
      f('reason', 'Reason', 'longtext'),
    ] },
    { id: 'hr-fin-tenancy', label: 'Tenancy Renewal – Payments', defaultPriority: 'Medium', fields: TENANCY_RENEWAL },
    { id: 'hr-fin-licence', label: 'Licence Renewal', defaultPriority: 'Medium', fields: LICENCE_RENEWAL },
  ] },
  // Finance → Academics (specific; Finance EXCLUDED from the Academics wildcard)
  { from: 'FIN', to: 'ACA', categories: [
    { id: 'fin-aca-receipt', label: 'Student Payment Receipt', defaultPriority: 'Medium', fields: [
      f('studentId', 'Student ID', 'text'),
      f('studentName', 'Student name', 'text'),
      f('amount', 'Amount (GBP)', 'money'),
      f('reference', 'Reference no.', 'text'),
      f('paymentDate', 'Payment date', 'date'),
    ] },
    { id: 'fin-aca-general', label: 'General Queries', defaultPriority: 'Medium', fields: [
      f('queryType', 'Query type', 'select', true, { options: ['Student record', 'Schedule', 'Document', 'Other'] }),
      f('relatedStudentId', 'Related student ID', 'text', false),
    ] },
  ] },
  // Other → HR (SAL, MKT, ACA, ADM, FIN)
  ...CODES.filter((c) => c !== 'HR').map((from) => ({ from, to: 'HR' as DepartmentCode, categories: HR_INBOUND })),
  // Other → Academics (SAL, MKT, HR, ADM — Finance excluded, it has FIN→ACA)
  ...CODES.filter((c) => c !== 'ACA' && c !== 'FIN').map((from) => ({ from, to: 'ACA' as DepartmentCode, categories: ACADEMICS_INBOUND })),
];
