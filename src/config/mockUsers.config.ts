import type { User } from '@domain/types/auth.types';
import { DEPARTMENTS } from './departments.config';

/**
 * Mock accounts (P12 §3). The first seven ARE the canonical personas (USER_PERSONAS.md):
 * Priya Raman, Tom Whitfield, Dr Elena Marsh, James Carrow, Nadia Okonkwo, Ruth Bello,
 * Marcus Vane. Ruth Bello (Administration) holds SUPER_ADMIN by default (ratified R4 —
 * Administration governs; OQ-02 open: whether EVERY admin user does). Marcus Vane is the
 * dedicated department-agnostic System Administrator.
 *
 * ⚠️ The EIGHTH — Sofia Nowak — is **(C) a demo fixture, NOT a canonical persona.** She does not
 * appear in USER_PERSONAS.md and carries no ratified behaviour model. She exists because the
 * seven canonical personas are exactly ONE PER DEPARTMENT, which makes several real behaviours
 * impossible to exercise or demonstrate:
 *   - re-assigning a ticket to a colleague (D04 #2/#8) — there was nobody to re-assign to;
 *   - a destination colleague picking up a stalled ticket (D04 #7, canonical A/D actors) — the
 *     scenario the fix exists for is precisely "the assignee is on leave";
 *   - notification fan-out to a department of more than one person.
 * Do NOT retro-fit her into USER_PERSONAS.md or cite her as ratified. If the personas are ever
 * extended, that is a stakeholder decision and this comment should be the thing that changes.
 *
 * Frontend-only: no real credentials, no backend. Choosing an identity IS the sign-in.
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
  // The seven canonical personas (USER_PERSONAS.md).
  mk('u-sal', 'Priya Raman', 'priya.raman@demo.test', 'SAL', 'PR'),
  mk('u-mkt', 'Tom Whitfield', 'tom.whitfield@demo.test', 'MKT', 'TW'),
  mk('u-aca', 'Dr Elena Marsh', 'elena.marsh@demo.test', 'ACA', 'EM'),
  mk('u-hr', 'Nadia Okonkwo', 'nadia.okonkwo@demo.test', 'HR', 'NO'),
  mk('u-fin', 'James Carrow', 'james.carrow@demo.test', 'FIN', 'JC'),
  mk('u-adm', 'Ruth Bello', 'ruth.bello@demo.test', 'ADM', 'RB', true),
  mk('u-sys', 'Marcus Vane', 'marcus.vane@demo.test', 'ADM', 'MV', true),

  // (C) DEMO FIXTURE — not a canonical persona. A second Finance member, so the hub is a TEAM
  // rather than one person. Finance is the hub (destination for four departments), which makes it
  // the only department where "the assignee is unavailable" is a routine reality — and until now
  // the seeded data could not express it. See the header note before adding more.
  mk('u-fin-2', 'Sofia Nowak', 'sofia.nowak@demo.test', 'FIN', 'SN'),
];

export function mockUserById(id: string): User | undefined {
  return MOCK_USERS.find((u) => u.id === id);
}
