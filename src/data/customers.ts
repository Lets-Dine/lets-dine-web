import type { CustomerListItem, Minor } from '../domain/types';

/**
 * Customers are the people behind phone-number sessions (delivery, repeat
 * diners who gave a number). There is no backend for them yet, so this module
 * is the whole store: a hand-authored SAMPLE roster plus the three mutations
 * the screen needs. Swap the bodies for API calls when the endpoints exist —
 * the screen only ever talks to these functions.
 */

/** One line of a customer's running tab. Append-only: a payment never edits a charge, it sits beside it. */
export interface TabEntry {
  id: string;
  daysAgo: number;
  kind: 'CHARGE' | 'PAYMENT';
  amount: Minor;
  note: string;
}

/** An order of theirs the kitchen has not finished with yet. */
export interface PendingOrder {
  id: string;
  table: string;
  status: 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY';
  minsAgo: number;
  total: Minor;
  items: string[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  /** `YYYY-MM-DD`, or empty. */
  birthday: string;
  tags: string[];
  notes: string;
  offersOk: boolean;
  /** One entry per visit, in days before today. Visit count, last visit and the weekly tally all derive from this. */
  visitDaysAgo: number[];
  spend: Minor;
  favourites: string[];
  joinedDaysAgo: number;
  /** Bills put on their account, and what they have paid back. */
  tab: TabEntry[];
  pending: PendingOrder | null;
}

export const DIETARY_TAGS = ['Vegetarian', 'No spice', 'Extra spicy', 'No onion/garlic', 'Nut allergy', 'Birthday guest'];

/** What they owe: charges minus payments. Never negative from the UI — settling is capped at the balance. */
export const tabBalance = (c: Customer): Minor => c.tab.reduce((sum, e) => sum + (e.kind === 'CHARGE' ? e.amount : -e.amount), 0);

export const lastVisit = (c: Customer): number | null => (c.visitDaysAgo.length ? Math.min(...c.visitDaysAgo) : null);

export function segmentOf(c: Customer): CustomerListItem['segment'] {
  const last = lastVisit(c);
  if (last === null || c.joinedDaysAgo <= 30) return 'new';
  if (last > 45) return 'lapsed';
  return c.visitDaysAgo.length >= 6 ? 'regular' : 'occasional';
}

/** Visited-or-not for each of the last `weeks` weeks, oldest first. */
export function tally(c: Customer, weeks = 10): boolean[] {
  const out = Array<boolean>(weeks).fill(false);
  for (const d of c.visitDaysAgo) {
    const w = Math.floor(d / 7);
    if (w < weeks) out[weeks - 1 - w] = true;
  }
  return out;
}

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

/** The list-row view of a sample customer — the same shape the live endpoint returns. */
export const toListItem = (c: Customer): CustomerListItem => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  segment: segmentOf(c),
  visits: c.visitDaysAgo.length,
  lastVisitAt: lastVisit(c) === null ? null : daysAgo(lastVisit(c)!),
  spend: c.spend,
  joinedAt: daysAgo(c.joinedDaysAgo),
  visitWeeks: tally(c),
});

export const getCustomer = (id: string): Customer | undefined => store.find((c) => c.id === id);

/**
 * Stands in for the profile fields the list endpoint doesn't carry (favourites, tags, contact,
 * notes) so the profile sheet shows its full design against live rows. Invented — replace with
 * the detail endpoint's response.
 */
export const SAMPLE_DETAIL: Customer = {
  id: 'sample',
  name: '',
  phone: '',
  email: 'name@example.com',
  birthday: '1992-11-14',
  tags: ['Vegetarian'],
  notes: 'Prefers the corner table by the window.',
  offersOk: true,
  visitDaysAgo: [],
  spend: 0,
  favourites: ['Veg Fry Momo', 'Paneer Butter Masala', 'Kalo Dal Tadka'],
  joinedDaysAgo: 0,
  tab: [],
  pending: null,
};

/** "3 weeks ago" from a timestamp. */
export const since = (iso: string | null) => {
  const days = iso === null ? null : Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DAY));
  return days === null ? 'Not yet' : days === 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 14 ? `${days} days ago` : days < 60 ? `${Math.round(days / 7)} weeks ago` : `${Math.round(days / 30)} months ago`;
};

const rs = (n: number): Minor => n * 100;

// SAMPLE DATA — invented for the demo, not real people.
const BASE: Omit<Customer, 'tab' | 'pending'>[] = [
  { id: 'c1', name: 'Anita Gurung', phone: '9841 234 567', email: 'anita.g@example.com', birthday: '1992-11-14', tags: ['Vegetarian'], notes: 'Always asks for the corner table by the window. Brings her mother on Saturdays.', offersOk: true, visitDaysAgo: [2, 9, 16, 23, 30, 37, 44, 52, 60, 66, 79, 93], spend: rs(41280), favourites: ['Veg Fry Momo', 'Paneer Butter Masala', 'Kalo Dal Tadka'], joinedDaysAgo: 210 },
  { id: 'c2', name: 'Bikash Shrestha', phone: '9803 118 902', email: '', birthday: '', tags: ['Extra spicy'], notes: 'Orders by phone for the office, usually 6–8 people.', offersOk: true, visitDaysAgo: [1, 5, 8, 12, 19, 26, 33, 41, 55], spend: rs(63950), favourites: ['Chilli Momo', 'Chicken Sekuwa', 'Peri Peri Wings'], joinedDaysAgo: 160 },
  { id: 'c3', name: 'Sushila Tamang', phone: '9860 551 440', email: 'sushila.t@example.com', birthday: '1988-03-02', tags: [], notes: '', offersOk: false, visitDaysAgo: [4, 18, 40], spend: rs(9420), favourites: ['Chicken Thukpa'], joinedDaysAgo: 120 },
  { id: 'c4', name: 'Prakash Adhikari', phone: '9818 770 021', email: 'prakash@example.com', birthday: '1985-07-21', tags: ['No onion/garlic'], notes: 'Observes a strict diet on Tuesdays and Saturdays — confirm before suggesting grills.', offersOk: true, visitDaysAgo: [3, 10, 17, 24, 31, 45, 58], spend: rs(38760), favourites: ['Thakali Khana Set', 'Aloo Sadeko'], joinedDaysAgo: 300 },
  { id: 'c5', name: 'Mina Rai', phone: '9851 090 313', email: '', birthday: '', tags: ['No spice'], notes: '', offersOk: true, visitDaysAgo: [6], spend: rs(1840), favourites: ['Chicken Steam Momo'], joinedDaysAgo: 6 },
  { id: 'c6', name: 'Rohan Karki', phone: '9779 402 118', email: 'rohan.k@example.com', birthday: '1999-01-30', tags: [], notes: 'Student group, comes after exams. Splits bills many ways.', offersOk: true, visitDaysAgo: [72, 85, 99, 130], spend: rs(12600), favourites: ['Chicken Chowmein', 'Buff Jhol Momo'], joinedDaysAgo: 240 },
  { id: 'c7', name: 'Dolma Sherpa', phone: '9842 663 275', email: 'dolma.s@example.com', birthday: '1990-09-09', tags: ['Birthday guest'], notes: 'Birthday dinner for 12 booked last year — worth a reminder in early September.', offersOk: true, visitDaysAgo: [7, 21, 35, 49, 63, 77], spend: rs(52480), favourites: ['Mutton Sekuwa', 'Mutton Curry', 'Chicken Fried Rice'], joinedDaysAgo: 400 },
  { id: 'c8', name: 'Sanjay Thapa', phone: '9808 227 945', email: '', birthday: '', tags: ['Nut allergy'], notes: 'Severe peanut allergy — flag every order to the kitchen.', offersOk: false, visitDaysAgo: [11, 38], spend: rs(6150), favourites: ['Tandoori Chicken (Half)'], joinedDaysAgo: 80 },
  { id: 'c9', name: 'Nirmala Poudel', phone: '9856 301 664', email: 'nirmala.p@example.com', birthday: '1978-12-25', tags: ['Vegetarian'], notes: '', offersOk: true, visitDaysAgo: [14, 28, 42, 56, 70, 84, 98, 112], spend: rs(33210), favourites: ['Green Papaya Sadeko', 'Veg Fry Momo'], joinedDaysAgo: 520 },
  { id: 'c10', name: 'Tenzing Lama', phone: '9813 889 007', email: '', birthday: '', tags: [], notes: '', offersOk: true, visitDaysAgo: [9], spend: rs(2760), favourites: ['Chilli Momo'], joinedDaysAgo: 9 },
  { id: 'c11', name: 'Kabita Basnet', phone: '9861 445 190', email: 'kabita.b@example.com', birthday: '1995-05-17', tags: ['No spice'], notes: 'Prefers takeaway packed separately — sauces on the side.', offersOk: true, visitDaysAgo: [20, 100, 140, 165], spend: rs(8890), favourites: ['Crispy Calamari'], joinedDaysAgo: 330 },
  { id: 'c12', name: 'Hari Bhandari', phone: '9845 120 336', email: 'hari.b@example.com', birthday: '1970-02-08', tags: [], notes: 'Regular lunch hour, alone, quick service.', offersOk: true, visitDaysAgo: [1, 3, 6, 8, 10, 13, 15, 20, 22, 27, 31, 34], spend: rs(27300), favourites: ['Chicken Fried Rice', 'Chicken Chowmein'], joinedDaysAgo: 190 },
];

const tab = (id: string, daysAgo: number, kind: TabEntry['kind'], amount: number, note: string): TabEntry => ({ id, daysAgo, kind, amount: rs(amount), note });
// SAMPLE tabs and in-flight orders, keyed by customer id.
const EXTRA: Record<string, Partial<Pick<Customer, 'tab' | 'pending'>>> = {
  c1: { tab: [tab('t1', 41, 'CHARGE', 2400, 'Saturday lunch, 4 people'), tab('t2', 27, 'PAYMENT', 1000, 'Paid by cash'), tab('t3', 16, 'CHARGE', 1860, 'Birthday dinner'), tab('t4', 2, 'CHARGE', 980, 'Dinner for two')] },
  c2: {
    tab: [tab('t1', 33, 'CHARGE', 6400, 'Office lunch, 8 people'), tab('t2', 19, 'CHARGE', 5200, 'Office lunch, 6 people'), tab('t3', 12, 'PAYMENT', 8000, 'Paid by cash'), tab('t4', 5, 'CHARGE', 4650, 'Office lunch, 7 people')],
    pending: { id: 'o1', table: 'Table 6', status: 'PREPARING', minsAgo: 14, total: rs(3180), items: ['Chilli Momo ×3', 'Chicken Sekuwa ×2', 'Peri Peri Wings'] },
  },
  c4: { tab: [tab('t1', 20, 'CHARGE', 1200, 'Thakali set ×3'), tab('t2', 6, 'PAYMENT', 1200, 'Paid by card')] },
  c7: { pending: { id: 'o2', table: 'Table 2', status: 'READY', minsAgo: 31, total: rs(2240), items: ['Mutton Sekuwa', 'Chicken Fried Rice'] } },
  c12: { tab: [tab('t1', 8, 'CHARGE', 640, 'Lunch'), tab('t2', 1, 'CHARGE', 520, 'Lunch')], pending: { id: 'o3', table: 'Table 1', status: 'ACCEPTED', minsAgo: 3, total: rs(380), items: ['Chicken Chowmein'] } },
};
const SEED: Customer[] = BASE.map((c) => ({ tab: [], pending: null, ...EXTRA[c.id], ...c }));

let store: Customer[] = SEED;

export const listCustomers = (): Customer[] => store;

export type NewCustomer = Pick<Customer, 'name' | 'phone' | 'email' | 'birthday' | 'tags' | 'notes' | 'offersOk'>;

export function addCustomer(input: NewCustomer): Customer {
  const created: Customer = {
    ...input,
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    id: `c${Date.now()}`,
    visitDaysAgo: [],
    spend: 0,
    favourites: [],
    joinedDaysAgo: 0,
    tab: [],
    pending: null,
  };
  store = [created, ...store];
  return created;
}

export const updateCustomerNotes = (id: string, notes: string) => updateCustomer(id, { notes });

/** Edits a profile — a stored sample customer, or the sample profile shown for a live one. */
export function updateCustomer(id: string, patch: Partial<NewCustomer>): void {
  const next = { ...profileOf(id), ...patch };
  if (getCustomer(id)) store = store.map((c) => (c.id === id ? next : c));
  else demo.set(id, next);
}

export function removeCustomer(id: string): void {
  store = store.filter((c) => c.id !== id);
}

/**
 * Live customers have no stored profile or tab yet, so the page shows a sample one — remembered per
 * id so a settled payment sticks while the page is open. Invented; replace with the tab endpoint.
 */
const demo = new Map<string, Customer>();
export function profileOf(id: string): Customer {
  const known = getCustomer(id) ?? demo.get(id);
  if (known) return known;
  const made: Customer = { ...SAMPLE_DETAIL, id, tab: [tab('d1', 24, 'CHARGE', 3200, 'Dinner, 5 people'), tab('d2', 9, 'PAYMENT', 1500, 'Paid by cash'), tab('d3', 3, 'CHARGE', 1240, 'Lunch for two')], pending: { id: 'dp', table: 'Table 4', status: 'PREPARING', minsAgo: 9, total: rs(1420), items: ['Veg Fry Momo ×2', 'Paneer Butter Masala'] } };
  demo.set(id, made);
  return made;
}

/** Records a payment against their tab. Refuses nothing-to-pay, zero and over-payment so the balance can never go below zero. */
export function settleTab(id: string, amount: Minor, method: 'Cash' | 'Card', note: string): boolean {
  const c = profileOf(id);
  if ( !Number.isInteger(amount) || amount <= 0 || amount > tabBalance(c)) return false;
  const entry: TabEntry = { id: `t${Date.now()}`, daysAgo: 0, kind: 'PAYMENT', amount, note: note.trim() ? `Paid by ${method.toLowerCase()} — ${note.trim()}` : `Paid by ${method.toLowerCase()}` };
  const next = { ...c, tab: [...c.tab, entry] };
  if (getCustomer(id)) store = store.map((x) => (x.id === id ? next : x));
  else demo.set(id, next);
  return true;
}
