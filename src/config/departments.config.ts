import type { Department, DepartmentCode } from '@domain/types/auth.types';

/**
 * The six operational departments (PROJECT_CONSTITUTION §2.2). Configuration — the
 * single source of truth. `isDestination` = receives tickets (has a Department Queue):
 * Academics, HR, Finance. Sales, Marketing, Admin are (in these routes) pure requesters.
 * Finance is the central hub (receives AND raises).
 */
export const DEPARTMENTS: Readonly<Record<DepartmentCode, Department>> = {
  SAL: { id: 'dept-sal', code: 'SAL', name: 'Sales', isDestination: false },
  MKT: { id: 'dept-mkt', code: 'MKT', name: 'Marketing', isDestination: false },
  ACA: { id: 'dept-aca', code: 'ACA', name: 'Academics', isDestination: true },
  HR: { id: 'dept-hr', code: 'HR', name: 'Human Resources', isDestination: true },
  FIN: { id: 'dept-fin', code: 'FIN', name: 'Finance', isDestination: true },
  ADM: { id: 'dept-adm', code: 'ADM', name: 'Administration', isDestination: false },
  /**
   * RATIFIED AMENDMENT, 2026-08-04. The Constitution fixed six departments; the stakeholder added
   * Operations as a seventh with the routing consequence understood and accepted.
   *
   * `isDestination: false` is the conservative half of that: a department only receives tickets
   * once someone has ratified WHAT it receives, and no inbound categories exist for Operations.
   * Making it a destination without categories would give it a queue that nothing can ever enter.
   */
  OPS: { id: 'dept-ops', code: 'OPS', name: 'Operations', isDestination: false },
};

export const DEPARTMENT_LIST: readonly Department[] = Object.values(DEPARTMENTS);

export function departmentByCode(code: DepartmentCode): Department {
  return DEPARTMENTS[code];
}
