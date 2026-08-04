import type { User } from '@domain/types/auth.types';
import { DEPARTMENTS } from './departments.config';

/**
 * THE ORGANISATION (stakeholder-supplied, 2026-08-04).
 *
 * ⚠️ THIS REPLACED THE SEVEN CANONICAL PERSONAS. Priya Raman, Tom Whitfield, Dr Elena Marsh,
 * James Carrow, Nadia Okonkwo, Ruth Bello and Marcus Vane — plus Sofia Nowak, Rowan Ashcroft and
 * the four second-members — are RETIRED. `USER_PERSONAS.md` still describes them and is now a
 * historical document with respect to identities: its behaviour models no longer map to any
 * account. Do not cite it for who exists; cite this file.
 *
 * These are real people in the stakeholder's business, not fixtures, so the demo/canonical
 * distinction that governed Sofia Nowak no longer applies — there is one cast now.
 *
 * WHAT A TITLE IS AND IS NOT. `USER_TITLES` below is DISPLAY TEXT. It grants nothing, is read by
 * nothing that authorises, and must never become one: permissions here are route-derived and
 * BUSINESS_DOMAIN_MODEL §2.3 forbids a role-keyed permission table. "Manager" as a *capability*
 * comes from `Department.managerId` alone — a title saying Manager confers no power, and a person
 * whose title says Executive can still manage a department if they hold that field. Hafeez is
 * exactly that case, and it is not a contradiction.
 *
 * Frontend identity source in localStorage mode, and the list the API seeds from in API mode.
 */
function mk(
  id: string,
  name: string,
  email: string,
  code: keyof typeof DEPARTMENTS,
  initials: string,
  sysadmin = false,
): User {
  const dept = DEPARTMENTS[code];
  return {
    id,
    name,
    email,
    departmentId: dept.id,
    departmentCode: dept.code,
    avatarInitials: initials,
    role: {
      departmentId: dept.id,
      departmentCode: dept.code,
      capabilities: sysadmin ? ['SUPER_ADMIN'] : [],
    },
  };
}

export const MOCK_USERS: readonly User[] = [
  /**
   * ── Managing Directors ──────────────────────────────────────────────────────────────────────
   * THEY HOLD `SUPER_ADMIN`, as the highest authority in the business (stakeholder, 2026-08-04).
   *
   * It was briefly given to Susrita on the reasoning that ratified R4 puts governance with the
   * Administration DEPARTMENT — but that read her job TITLE, "Administrative Executive", as if it
   * were authority. It is not, and this file's own rule says so: a title grants nothing. R4 is
   * still honoured, because the MDs sit in Administration too.
   *
   * The 2026-08-03 decision to separate the MD from the system administrator held while a
   * dedicated sysadmin existed (Marcus Vane). This organisation names none, and the alternative
   * was leaving the capability with someone junior to the people it governs.
   *
   * Placed in Administration because every user needs a department. They are department-agnostic
   * in intent, which the "an MD has no line manager" rule in leave.config actually expresses.
   */
  mk('u-raja', 'Raja', 'raja@demo.test', 'ADM', 'RJ', true),
  mk('u-maha', 'Maha', 'maha@demo.test', 'ADM', 'MH', true),

  /**
   * ── Administration ──────────────────────────────────────────────────────────────────────────
   * Susrita is an ORDINARY EMPLOYEE and deliberately holds no capability. She supports every
   * department, which is why she sits in Administration — but supporting them is not governing
   * them, and it grants no sight of their work. Without `SUPER_ADMIN` her report and dashboard
   * scope is `own`, so she sees Administration's own tickets and nobody else's.
   */
  mk('u-susrita', 'Susrita', 'susrita@demo.test', 'ADM', 'SU'),

  // ── Digital Marketing ───────────────────────────────────────────────────────────────────────
  mk('u-balu', 'Balu', 'balu@demo.test', 'MKT', 'BL'),
  mk('u-sakshi', 'Sakshi', 'sakshi@demo.test', 'MKT', 'SK'),
  mk('u-mufeeda', 'Mufeeda', 'mufeeda@demo.test', 'MKT', 'MF'),
  mk('u-minhaj', 'Minhaj', 'minhaj@demo.test', 'MKT', 'MJ'),
  mk('u-anas', 'Anas', 'anas@demo.test', 'MKT', 'AS'),
  mk('u-john', 'John', 'john@demo.test', 'MKT', 'JN'),
  mk('u-manahil', 'Manahil', 'manahil@demo.test', 'MKT', 'MN'),
  mk('u-absal', 'Absal', 'absal@demo.test', 'MKT', 'AB'),

  // ── Sales ───────────────────────────────────────────────────────────────────────────────────
  mk('u-hafeez', 'Hafeez', 'hafeez@demo.test', 'SAL', 'HF'),
  mk('u-iqra', 'Iqra', 'iqra@demo.test', 'SAL', 'IQ'),
  mk('u-vakas', 'Vakas', 'vakas@demo.test', 'SAL', 'VK'),
  mk('u-rajesh', 'Rajesh', 'rajesh@demo.test', 'SAL', 'RS'),
  mk('u-ranjit', 'Ranjit', 'ranjit@demo.test', 'SAL', 'RN'),
  mk('u-nisha', 'Nisha', 'nisha@demo.test', 'SAL', 'NS'),
  mk('u-bakar', 'Bakar', 'bakar@demo.test', 'SAL', 'BK'),

  // ── Finance ─────────────────────────────────────────────────────────────────────────────────
  mk('u-raza', 'Raza', 'raza@demo.test', 'FIN', 'RZ'),
  mk('u-hasna', 'Hasna', 'hasna@demo.test', 'FIN', 'HS'),

  // ── Academics ───────────────────────────────────────────────────────────────────────────────
  // No line manager was named; final approval is an MD. Their leave therefore skips the MANAGER
  // stage and begins at HR, which is the ratified behaviour for a department without one.
  mk('u-radhika', 'Radhika', 'radhika@demo.test', 'ACA', 'RD'),
  mk('u-henoc', 'Henoc', 'henoc@demo.test', 'ACA', 'HN'),
  mk('u-anu', 'Anu', 'anu@demo.test', 'ACA', 'AU'),

  // ── Operations (the ratified 7th department) ────────────────────────────────────────────────
  mk('u-amna', 'Amna', 'amna@demo.test', 'OPS', 'AM'),
  mk('u-hussain', 'Hussain', 'hussain@demo.test', 'OPS', 'HU'),
  mk('u-samah', 'Samah', 'samah@demo.test', 'OPS', 'SM'),

  // ── Human Resources ─────────────────────────────────────────────────────────────────────────
  // Sole member, and therefore also the HR approver every leave chain passes through.
  mk('u-sneha', 'Sneha', 'sneha@demo.test', 'HR', 'SN'),
];

/**
 * Job titles — DISPLAY ONLY. See the header: nothing authorises from these, and nothing may.
 * Kept beside the identities rather than on `User` so the API's user model needs no column for a
 * string that only ever renders.
 */
export const USER_TITLES: Readonly<Record<string, string>> = {
  'u-raja': 'Managing Director',
  'u-maha': 'Managing Director',
  'u-susrita': 'Admin Executive',
  'u-balu': 'Digital Marketing Manager',
  'u-sakshi': 'Content Creator',
  'u-mufeeda': 'DM Executive',
  'u-minhaj': 'DM Executive',
  'u-anas': 'DM Executive',
  'u-john': 'Creative Designer',
  'u-manahil': 'Creative Designer',
  'u-absal': 'Creative Designer',
  'u-hafeez': 'Sales Executive & Manager',
  'u-iqra': 'Sales Executive',
  'u-vakas': 'Sales Executive',
  'u-rajesh': 'Sales Executive',
  'u-ranjit': 'Sales Executive',
  'u-nisha': 'Sales Executive',
  'u-bakar': 'Sales Executive',
  'u-raza': 'Finance Manager',
  'u-hasna': 'Finance Assistant',
  'u-radhika': 'Academics Executive',
  'u-henoc': 'Academics Executive',
  'u-anu': 'Academics Executive',
  'u-amna': 'Operations General Manager',
  'u-hussain': 'Operations Executive',
  'u-samah': 'Operations Executive',
  'u-sneha': 'HR Executive',
};

export const titleOf = (userId: string): string => USER_TITLES[userId] ?? '';

export function mockUserById(id: string): User | undefined {
  return MOCK_USERS.find((u) => u.id === id);
}
