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
};

export const DEPARTMENT_LIST: readonly Department[] = Object.values(DEPARTMENTS);

export function departmentByCode(code: DepartmentCode): Department {
  return DEPARTMENTS[code];
}
