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
  | 'audit:view'
  | 'payments:view'
  | 'payments:discount'
  | 'customers:view'
  | 'customers:edit'
  | 'ledger:view'
  | 'ledger:manage'
  | 'ledger:reopen'
  | 'inventory:view'
  | 'inventory:manage'
  | 'billing:view'
  | 'billing:manage';

const STAFF: Permission[] = ['orders:view', 'orders:advance', 'menu:view', 'payments:view', 'customers:view'];

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
  'payments:discount',
  'customers:edit',
  // Expenses and the cash-up: a manager keeps the books.
  'ledger:view',
  'ledger:manage',
  // Stock is bought and counted by whoever keeps the books.
  'inventory:view',
  'inventory:manage',
  // The plan's status and usage — what the restaurant is on and when it needs attention. No money.
  'billing:view',
];

const GRANTS: Record<StaffRole, Permission[]> = {
  STAFF,
  MANAGER,
  // Prices, invoices and changing plan: the owner is who commits the restaurant to a plan.
  OWNER: [...MANAGER, 'settings:edit', 'billing:manage', 'ledger:reopen'],
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
  OWNER: 'Everything, including settings, fees and the plan',
  MANAGER: 'Menu, tables, orders, reviews, analytics and the plan status',
  STAFF: 'The order queue only',
};
