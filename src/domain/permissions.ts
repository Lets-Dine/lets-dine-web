import type { StaffRole } from './types';

/**
 * §50. Three roles, one table. STAFF work the pass and nothing else; MANAGER
 * runs the restaurant; OWNER additionally owns money and people.
 *
 * The UI asks `can()` before rendering a control *and* the API asks it again
 * before performing the action — a hidden button is a courtesy, not a rule.
 */
export type Permission =
  | 'orders:view'
  | 'orders:advance'
  | 'orders:cancel'
  | 'menu:view'
  | 'menu:edit'
  | 'menu:price'
  | 'tables:view'
  | 'tables:edit'
  | 'reviews:view'
  | 'analytics:view'
  | 'settings:view'
  | 'settings:edit'
  | 'audit:view';

const STAFF: Permission[] = ['orders:view', 'orders:advance', 'menu:view'];

const MANAGER: Permission[] = [
  ...STAFF,
  'orders:cancel',
  'menu:edit',
  'menu:price',
  'tables:view',
  'tables:edit',
  'reviews:view',
  'analytics:view',
  'settings:view',
  'audit:view',
];

const GRANTS: Record<StaffRole, Permission[]> = {
  STAFF,
  MANAGER,
  OWNER: [...MANAGER, 'settings:edit'],
};

export function can(role: StaffRole, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  STAFF: 'Staff',
};

export const ROLE_SCOPE: Record<StaffRole, string> = {
  OWNER: 'Everything, including settings and fees',
  MANAGER: 'Menu, tables, orders, reviews and analytics',
  STAFF: 'The order queue only',
};
