import { RESTAURANT } from './menu';
import type { StaffMember } from '../domain/types';

/**
 * Demo accounts, one per role. Real staff authentication is server-side and
 * out of scope here (§23, §52) — what this stands in for is the *shape*: a
 * signed-in member with a role, whose role decides what the API will do.
 */
export const STAFF: StaffMember[] = [
  {
    id: 'stf_owner',
    restaurantId: RESTAURANT.id,
    name: 'Ranjana Shrestha',
    email: 'ranjana@sekuwaghar.np',
    role: 'OWNER',
  },
  {
    id: 'stf_manager',
    restaurantId: RESTAURANT.id,
    name: 'Bikash Tamang',
    email: 'bikash@sekuwaghar.np',
    role: 'MANAGER',
  },
  {
    id: 'stf_staff',
    restaurantId: RESTAURANT.id,
    name: 'Sunita Rai',
    email: 'sunita@sekuwaghar.np',
    role: 'STAFF',
  },
];

export const DEMO_PIN = '1234';
