import type { Minor, Order, StaffMember } from '../domain/types';
import {
  accountFor,
  balanceOf,
  partnerFee,
  riderFee,
  sameAccount,
  statementOf,
} from '../domain/delivery';
import type {
  Account,
  CourierDetail,
  DeliveryAssignment,
  DeliveryData,
  DeliveryOverview,
  DeliveryPartner,
  PartnerListing,
  RiderListing,
  StatementLine,
  StatementPage,
  PartnerFeeModel,
  Rider,
  RiderKind,
  RiderPayModel,
  Settlement,
} from '../domain/delivery';
import { IS_LIVE_API, apiRequest } from './http';
import * as mockOrders from './admin';
import { authHeaders, settleDeliveryOrder as liveSettleDeliveryOrder } from './live-admin';
import { ApiError, latency, uid } from './store';

/**
 * Delivery partners, riders, dispatches and settlements.
 *
 * Against the real backend (`/restaurant/delivery/*`) the server owns everything, scoped to the
 * branch in the staff token. With no `VITE_API_URL` the offline demo keeps the same book in the
 * browser instead — one per device, filtered per branch — behind the very same functions. Every
 * function is async and takes the branch explicitly, so call sites never know which one answered.
 */
const BASE = '/restaurant/delivery';

const KEY = 'lets-dine:delivery:v1';

interface Book extends DeliveryData {
  /** Branches whose demo data has been planted — offline demo only. */
  seeded: string[];
}

const empty = (): Book => ({ partners: [], riders: [], assignments: [], settlements: [], seeded: [] });

function read(): Book {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty(), ...(JSON.parse(raw) as Partial<Book>) } : empty();
  } catch {
    return empty();
  }
}

function write(book: Book): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(book));
  } catch {
    /* storage full or blocked — the book lives for this session only */
  }
}

const now = () => new Date().toISOString();
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

/* ── Demo data ─────────────────────────────────────────────────────── */

/** Plants a believable week of runs the first time an offline demo branch opens the page. */
function seedDemo(book: Book, branchId: string): Book {
  const partnerA: DeliveryPartner = {
    id: uid('dp'), branchId, name: 'Roadrunner Couriers', phone: '98010 55501', contactPerson: 'Mina Karki', note: 'Settles every Friday.',
    feeModel: 'PERCENT', feeValue: 1200, collectsCash: true, isActive: true, createdAt: ago(24 * 60),
  };
  const partnerB: DeliveryPartner = {
    id: uid('dp'), branchId, name: 'QuickBite Logistics', phone: '98010 55502', contactPerson: '', note: '',
    feeModel: 'FLAT', feeValue: 15000, collectsCash: false, isActive: true, createdAt: ago(24 * 40),
  };
  const mk = (name: string, phone: string, kind: RiderKind, payModel: RiderPayModel, payValue: Minor, partnerId: string | null, vehicle: string): Rider => ({
    id: uid('rd'), branchId, name, phone, kind, partnerId, vehicle, note: '', payModel, payValue, isActive: true, createdAt: ago(24 * 30),
  });
  const ramesh = mk('Ramesh Thapa', '98410 22201', 'STAFF', 'PER_DELIVERY', 6000, null, 'Bike · Ba 41 Pa 2210');
  const sita = mk('Sita Gurung', '98410 22202', 'STAFF', 'SALARIED', 0, null, 'Scooter');
  const bikash = mk('Bikash Rai', '98410 22203', 'FREELANCE', 'PER_DELIVERY', 8000, null, 'Bike');
  const anil = mk('Anil Shrestha', '98010 55511', 'FREELANCE', 'SALARIED', 0, partnerA.id, 'Bike');
  const pooja = mk('Pooja Tamang', '98010 55512', 'FREELANCE', 'SALARIED', 0, partnerA.id, 'Scooter');

  const run = (n: number, who: { rider?: Rider; partner?: DeliveryPartner }, customer: string, total: Minor, hoursAgo: number, cash: boolean, open = false): DeliveryAssignment => {
    const account = accountFor(who.rider ?? null, who.partner ?? null)!;
    const rider = who.rider ?? null;
    const partner = who.partner ?? (rider?.partnerId ? (rider.partnerId === partnerA.id ? partnerA : partnerB) : null);
    const fee = partner ? partnerFee(partner, total) : rider ? riderFee(rider) : 0;
    const takes = cash && (!partner || partner.collectsCash) ? total : 0;
    return {
      id: uid('da'), branchId, orderId: uid('demo'), orderRef: `#${1000 + n}`, customerName: customer, orderTotal: total,
      riderId: rider?.id ?? null, partnerId: partner?.id ?? null, riderName: rider?.name ?? null, partnerName: partner?.name ?? null, accountKind: account.kind, accountId: account.id,
      status: open ? 'ASSIGNED' : 'DELIVERED', assignedAt: ago(hoursAgo + 0.6), deliveredAt: open ? null : ago(hoursAgo),
      courierFee: fee, cashToCollect: takes, cashCollected: open ? null : takes,
    };
  };

  const assignments = [
    run(1, { rider: ramesh }, 'Aarav Joshi', 148000, 70, true),
    run(2, { rider: ramesh }, 'Kritika Basnet', 92000, 52, true),
    run(3, { rider: ramesh }, 'Prakash Dahal', 216000, 27, true),
    run(4, { rider: ramesh }, 'Sunita Magar', 134500, 3.2, true),
    run(5, { rider: sita }, 'Dipesh Acharya', 78000, 49, true),
    run(6, { rider: sita }, 'Rina Khadka', 119000, 6, true),
    run(7, { rider: bikash }, 'Nabin Oli', 164000, 30, false),
    run(8, { rider: bikash }, 'Sarita Pandey', 88000, 8, true),
    run(9, { rider: anil }, 'Hari Bhandari', 252000, 73, true),
    run(10, { rider: anil }, 'Laxmi Sharma', 101500, 28, true),
    run(11, { rider: pooja }, 'Roshan Lama', 143000, 9, true),
    run(12, { rider: pooja }, 'Gita Rana', 67500, 4.4, true),
    run(13, { partner: partnerB }, 'Manish Koirala', 128000, 54, false),
    run(14, { partner: partnerB }, 'Anju Neupane', 99000, 12, false),
    run(15, { partner: partnerB }, 'Tek Bista', 187000, 5, false),
    run(16, { rider: ramesh }, 'Sabina Thapa', 156500, 0.3, true, true),
    run(17, { rider: pooja }, 'Bimal Rijal', 112000, 0.2, true, true),
  ];

  const settlements: Settlement[] = [
    { id: uid('st'), branchId, accountKind: 'RIDER', accountId: ramesh.id, direction: 'COLLECT', amount: 240500, method: 'CASH', note: 'Handed over after dinner service', at: ago(24) },
    { id: uid('st'), branchId, accountKind: 'PARTNER', accountId: partnerB.id, direction: 'PAYOUT', amount: 15000, method: 'BANK', note: 'Week 1 statement, one run', at: ago(30) },
  ];

  return {
    ...book,
    partners: [...book.partners, partnerA, partnerB],
    riders: [...book.riders, ramesh, sita, bikash, anil, pooja],
    assignments: [...book.assignments, ...assignments],
    settlements: [...book.settlements, ...settlements],
    seeded: [...book.seeded, branchId],
  };
}

/* ── Reads ─────────────────────────────────────────────────────────── */

const inBranch = <T extends { branchId: string }>(rows: T[], branchId: string) => rows.filter((row) => row.branchId === branchId);

/** Everything one branch has in the offline book. The server never sends this whole; the pages below derive from it. */
async function localFetchDeliveryBook(branchId: string): Promise<DeliveryData> {
  await latency();
  let book = read();
  if (!IS_LIVE_API && !book.seeded.includes(branchId)) {
    book = seedDemo(book, branchId);
    write(book);
  }
  return {
    partners: inBranch(book.partners, branchId),
    riders: inBranch(book.riders, branchId),
    assignments: inBranch(book.assignments, branchId),
    settlements: inBranch(book.settlements, branchId),
  };
}

const MONTH_MS = 30 * 86_400_000;

/** Same shapes the server answers with, derived from the offline book. */
async function localFetchOverview(branchId: string): Promise<DeliveryOverview> {
  const data = await localFetchDeliveryBook(branchId);
  const now = Date.now();
  const runs30 = (match: (a: DeliveryAssignment) => boolean) =>
    data.assignments.filter((a) => a.status === 'DELIVERED' && match(a) && now - Date.parse(a.deliveredAt ?? a.assignedAt) < MONTH_MS).length;
  const openOf = (rider: Rider) => data.assignments.filter((a) => a.riderId === rider.id && a.status === 'ASSIGNED').length;

  const partners: PartnerListing[] = data.partners.map((partner) => ({
    ...partner,
    balance: balanceOf({ kind: 'PARTNER', id: partner.id }, data.assignments, data.settlements),
    riders: data.riders.filter((r) => r.partnerId === partner.id).length,
    runs30: runs30((a) => a.accountId === partner.id),
  }));
  const riders: RiderListing[] = data.riders.map((rider) => ({
    ...rider,
    balance: rider.partnerId ? null : balanceOf({ kind: 'RIDER', id: rider.id }, data.assignments, data.settlements),
    open: openOf(rider),
    partnerName: data.partners.find((p) => p.id === rider.partnerId)?.name ?? null,
    runs30: runs30((a) => a.riderId === rider.id),
  }));
  const balances = [...partners.map((p) => p.balance), ...riders.flatMap((r) => (r.balance ? [r.balance] : []))];
  return {
    partners,
    riders,
    summary: {
      onRoad: data.assignments.filter((a) => a.status === 'ASSIGNED').length,
      cashOut: balances.reduce((sum, b) => sum + Math.max(b.cashHeld, 0), 0),
      owed: balances.reduce((sum, b) => sum + Math.max(b.feesOwed, 0), 0),
    },
  };
}

async function localFetchCourierDetail(branchId: string, kind: Account['kind'], id: string): Promise<CourierDetail> {
  const overview = await localFetchOverview(branchId);
  const data = await localFetchDeliveryBook(branchId);
  const partner = kind === 'PARTNER' ? (overview.partners.find((p) => p.id === id) ?? null) : null;
  const rider = kind === 'RIDER' ? (overview.riders.find((r) => r.id === id) ?? null) : null;
  if (!partner && !rider) throw new ApiError(404, `That ${kind === 'PARTNER' ? 'partner' : 'rider'} no longer exists.`, 'NOT_FOUND');
  const open = data.assignments.filter((a) => a.status === 'ASSIGNED' && (rider ? a.riderId === rider.id : a.partnerId === id || a.accountId === id));
  return {
    partner,
    rider,
    parent: rider?.partnerId ? (data.partners.find((p) => p.id === rider.partnerId) ?? null) : null,
    openRuns: open.sort((a, b) => Date.parse(b.assignedAt) - Date.parse(a.assignedAt)),
    riders: partner ? overview.riders.filter((r) => r.partnerId === partner.id) : [],
    partners: rider ? data.partners.filter((p) => p.isActive || p.id === rider.partnerId) : [],
  };
}

const STATEMENT_PAGE = 30;

/** The cursor is just an offset here — the offline book is small and lives in the browser. */
async function localFetchStatement(branchId: string, kind: Account['kind'], id: string, cursor?: string | null): Promise<StatementPage> {
  const data = await localFetchDeliveryBook(branchId);
  const rider = kind === 'RIDER' ? data.riders.find((r) => r.id === id) : undefined;
  const lines: StatementLine[] =
    rider?.partnerId
      ? data.assignments
          .filter((a) => a.riderId === id && a.status === 'DELIVERED')
          .map((a): StatementLine => ({ type: 'RUN', id: a.id, at: a.deliveredAt ?? a.assignedAt, assignment: a }))
      : statementOf({ kind, id }, data.assignments, data.settlements);
  const newestFirst = [...lines].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const from = Number(cursor ?? 0) || 0;
  const entries = newestFirst.slice(from, from + STATEMENT_PAGE);
  return { entries, nextCursor: from + STATEMENT_PAGE < newestFirst.length ? String(from + STATEMENT_PAGE) : null };
}

/** The open or most recent run of one order — what a delivery ticket shows and settles. */
async function localFetchAssignmentForOrder(orderId: string): Promise<DeliveryAssignment | null> {
  const book = read();
  const runs = book.assignments.filter((a) => a.orderId === orderId);
  return runs.find((a) => a.status === 'ASSIGNED') ?? runs[runs.length - 1] ?? null;
}

/* ── Couriers ──────────────────────────────────────────────────────── */

export interface PartnerDraft {
  name: string;
  phone: string;
  contactPerson: string;
  note: string;
  feeModel: PartnerFeeModel;
  feeValue: number;
  collectsCash: boolean;
}

export interface RiderDraft {
  name: string;
  phone: string;
  kind: RiderKind;
  partnerId: string | null;
  vehicle: string;
  note: string;
  payModel: RiderPayModel;
  payValue: Minor;
}

const clean = (text: string) => text.trim();

function requireName(name: string, noun: string) {
  if (clean(name).length < 2) throw new ApiError(400, `Give the ${noun} a name.`, 'VALIDATION');
}

async function localSavePartner(branchId: string, draft: PartnerDraft, id?: string): Promise<DeliveryPartner> {
  await latency();
  requireName(draft.name, 'partner');
  const book = read();
  const fields = { ...draft, name: clean(draft.name), phone: clean(draft.phone), contactPerson: clean(draft.contactPerson), note: clean(draft.note) };
  if (id) {
    const current = book.partners.find((p) => p.id === id && p.branchId === branchId);
    if (!current) throw new ApiError(404, 'That partner no longer exists.', 'NOT_FOUND');
    const next = { ...current, ...fields };
    write({ ...book, partners: book.partners.map((p) => (p.id === id ? next : p)) });
    return next;
  }
  const created: DeliveryPartner = { id: uid('dp'), branchId, ...fields, isActive: true, createdAt: now() };
  write({ ...book, partners: [...book.partners, created] });
  return created;
}

async function localSaveRider(branchId: string, draft: RiderDraft, id?: string): Promise<Rider> {
  await latency();
  requireName(draft.name, 'rider');
  const book = read();
  const fields = { ...draft, name: clean(draft.name), phone: clean(draft.phone), vehicle: clean(draft.vehicle), note: clean(draft.note) };
  if (id) {
    const current = book.riders.find((r) => r.id === id && r.branchId === branchId);
    if (!current) throw new ApiError(404, 'That rider no longer exists.', 'NOT_FOUND');
    const next = { ...current, ...fields };
    write({ ...book, riders: book.riders.map((r) => (r.id === id ? next : r)) });
    return next;
  }
  const created: Rider = { id: uid('rd'), branchId, ...fields, isActive: true, createdAt: now() };
  write({ ...book, riders: [...book.riders, created] });
  return created;
}

/** Turning a courier off keeps its history; it just stops being offered at dispatch. */
async function localSetCourierActive(account: Account, isActive: boolean): Promise<void> {
  await latency();
  const book = read();
  write(
    account.kind === 'PARTNER'
      ? { ...book, partners: book.partners.map((p) => (p.id === account.id ? { ...p, isActive } : p)) }
      : { ...book, riders: book.riders.map((r) => (r.id === account.id ? { ...r, isActive } : r)) },
  );
}

/* ── Dispatch ──────────────────────────────────────────────────────── */

export interface DispatchDraft {
  riderId: string | null;
  partnerId: string | null;
  courierFee: Minor;
  /** 0 when the customer has already paid, or the courier does not take cash. */
  cashToCollect: Minor;
}

/** Hands an order to a courier. A run that is still open for this order is replaced, so reassigning is one step. */
async function localAssignDelivery(branchId: string, order: Pick<Order, 'id' | 'reference' | 'total' | 'deliveryCustomerName'>, draft: DispatchDraft): Promise<DeliveryAssignment> {
  await latency();
  const book = read();
  const rider = draft.riderId ? (book.riders.find((r) => r.id === draft.riderId) ?? null) : null;
  const partner = draft.partnerId ? (book.partners.find((p) => p.id === draft.partnerId) ?? null) : null;
  const account = accountFor(rider, partner);
  if (!account) throw new ApiError(400, 'Choose a rider or a partner.', 'VALIDATION');
  const run: DeliveryAssignment = {
    id: uid('da'),
    branchId,
    orderId: order.id,
    orderRef: order.reference,
    customerName: order.deliveryCustomerName || 'Guest',
    orderTotal: order.total,
    riderId: rider?.id ?? null,
    partnerId: partner?.id ?? rider?.partnerId ?? null,
    riderName: rider?.name ?? null,
    partnerName: partner?.name ?? (rider?.partnerId ? (book.partners.find((p) => p.id === rider.partnerId)?.name ?? null) : null),
    accountKind: account.kind,
    accountId: account.id,
    status: 'ASSIGNED',
    assignedAt: now(),
    deliveredAt: null,
    courierFee: Math.max(0, draft.courierFee),
    cashToCollect: Math.max(0, draft.cashToCollect),
    cashCollected: null,
  };
  write({ ...book, assignments: [...book.assignments.filter((a) => !(a.orderId === order.id && a.status === 'ASSIGNED')), run] });
  return run;
}

/** Closes a run. `cashCollected` is what really came back — short cash is recorded, never refused. */
async function localCompleteDelivery(orderId: string, cashCollected: Minor): Promise<DeliveryAssignment | null> {
  await latency();
  const book = read();
  const open = book.assignments.find((a) => a.orderId === orderId && a.status === 'ASSIGNED');
  if (!open) return null;
  const done: DeliveryAssignment = { ...open, status: 'DELIVERED', deliveredAt: now(), cashCollected: Math.max(0, cashCollected) };
  write({ ...book, assignments: book.assignments.map((a) => (a.id === open.id ? done : a)) });
  return done;
}

/* ── Settlements ───────────────────────────────────────────────────── */

export interface SettlementDraft {
  direction: Settlement['direction'];
  amount: Minor;
  /** Cleared on the other side in the same act — see `Settlement.offset`. */
  offset: Minor;
  method: Settlement['method'];
  note: string;
}

async function localRecordSettlement(branchId: string, account: Account, draft: SettlementDraft): Promise<Settlement> {
  await latency();
  // Same rule as the server: a courier's cash comes in when each order is settled; on its own only a fee is paid.
  if (draft.direction === 'COLLECT') throw new ApiError(400, "A courier's cash is received when each order is settled, not as a separate collection.", 'VALIDATION');
  if (draft.offset > 0) throw new ApiError(400, "A payment to a courier can't be netted off cash.", 'VALIDATION');
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) throw new ApiError(400, 'Enter an amount above zero.', 'VALIDATION');
  const book = read();
  const balance = balanceOf(account, inBranch(book.assignments, branchId), book.settlements.filter((s) => sameAccount(account, s)));
  if (draft.amount > Math.max(balance.feesOwed, 0)) throw new ApiError(400, 'That is more than you owe them.', 'VALIDATION');
  const created: Settlement = { id: uid('st'), branchId, accountKind: account.kind, accountId: account.id, ...draft, offset: 0, note: clean(draft.note), at: now() };
  write({ ...book, settlements: [...book.settlements, created] });
  return created;
}

/** The key a branch's records are filed under. The offline demo has no branches, so it has one. */
export const branchKeyOf = (staff: { branchId?: string }) => staff.branchId ?? 'main';

/* ── Dispatch: live or local ───────────────────────────────────────── */

const call = <T>(method: string, path: string, body?: unknown) =>
  apiRequest<T>(`${BASE}${path}`, { method, headers: authHeaders(), ...(body !== undefined && { body: JSON.stringify(body) }) });

const accountPath = (account: Account) => `${account.kind === 'PARTNER' ? 'partners' : 'riders'}/${account.id}`;

/** The Delivery page: every courier with its balance, and the headline numbers. No runs, no settlements. */
export function fetchDeliveryOverview(branchId: string): Promise<DeliveryOverview> {
  return IS_LIVE_API ? call<DeliveryOverview>('GET', '/book') : localFetchOverview(branchId);
}

/** One courier's page: terms, balance, who is on the road. Its transactions come from `fetchCourierStatement`. */
export function fetchCourierDetail(branchId: string, kind: Account['kind'], id: string): Promise<CourierDetail> {
  return IS_LIVE_API ? call<CourierDetail>('GET', `/${accountPath({ kind, id })}`) : localFetchCourierDetail(branchId, kind, id);
}

/** One page of a courier's transactions, newest first. Pass the previous page's `nextCursor` for the next. */
export function fetchCourierStatement(branchId: string, kind: Account['kind'], id: string, cursor?: string | null): Promise<StatementPage> {
  if (!IS_LIVE_API) return localFetchStatement(branchId, kind, id, cursor);
  const query = new URLSearchParams({ limit: String(STATEMENT_PAGE), ...(cursor && { cursor }) });
  return call<StatementPage>('GET', `/${accountPath({ kind, id })}/transactions?${query}`);
}

/** What the ticket's courier picker needs: active couriers and open runs only, with no money history. */
export function fetchDispatchBook(branchId: string): Promise<DeliveryData> {
  return IS_LIVE_API ? call<DeliveryData>('GET', '/couriers') : localFetchDeliveryBook(branchId);
}

/** The open or most recent run of one order — what a delivery ticket shows and settles. */
export function fetchAssignmentForOrder(orderId: string): Promise<DeliveryAssignment | null> {
  return IS_LIVE_API ? call<DeliveryAssignment | null>('GET', `/orders/${orderId}/assignment`) : localFetchAssignmentForOrder(orderId);
}

export function savePartner(branchId: string, draft: PartnerDraft, id?: string): Promise<DeliveryPartner> {
  if (!IS_LIVE_API) return localSavePartner(branchId, draft, id);
  return id ? call<DeliveryPartner>('PATCH', `/partners/${id}`, draft) : call<DeliveryPartner>('POST', '/partners', draft);
}

export function saveRider(branchId: string, draft: RiderDraft, id?: string): Promise<Rider> {
  if (!IS_LIVE_API) return localSaveRider(branchId, draft, id);
  return id ? call<Rider>('PATCH', `/riders/${id}`, draft) : call<Rider>('POST', '/riders', draft);
}

/** Turning a courier off keeps its history; it just stops being offered at dispatch. */
export async function setCourierActive(account: Account, isActive: boolean): Promise<void> {
  if (!IS_LIVE_API) return localSetCourierActive(account, isActive);
  await call('PATCH', `/${accountPath(account)}`, { isActive });
}

/** Hands an order to a courier. A run still open for this order is replaced, so reassigning is one step. */
export function assignDelivery(
  branchId: string,
  order: Pick<Order, 'id' | 'reference' | 'total' | 'deliveryCustomerName'>,
  draft: DispatchDraft,
): Promise<DeliveryAssignment> {
  return IS_LIVE_API ? call<DeliveryAssignment>('POST', `/orders/${order.id}/assign`, draft) : localAssignDelivery(branchId, order, draft);
}

/** Closes a run. `cashCollected` is what really came back — short cash is recorded, never refused. */
export function completeDelivery(orderId: string, cashCollected: Minor): Promise<DeliveryAssignment | null> {
  return IS_LIVE_API ? call<DeliveryAssignment | null>('POST', `/orders/${orderId}/complete`, { cashCollected }) : localCompleteDelivery(orderId, cashCollected);
}

export function recordSettlement(branchId: string, account: Account, draft: SettlementDraft): Promise<Settlement> {
  return IS_LIVE_API
    ? call<Settlement>('POST', '/settlements', { accountKind: account.kind, accountId: account.id, ...draft })
    : localRecordSettlement(branchId, account, draft);
}

/* ── Settling a delivered order ────────────────────────────────────── */

export interface SettleOrderInput {
  /** Pay the courier's fee as part of settling. False leaves it owed, to be paid later from the courier's page. */
  payFee: boolean;
  /** How the fee is paid, when it is. */
  feeMethod: 'CASH' | 'BANK';
}

/**
 * Settles a delivered order (`SETTLE -> COMPLETED`): the sale is booked as a payment, the courier's cash comes in,
 * their fee is paid now or left owed, and the cash book follows. The server does all of it in one transaction.
 * Offline there is no cash book, so the demo does the two halves it has — the order and its payment, and the
 * courier's side of the delivery book.
 */
export async function settleDelivery(actor: StaffMember, branchId: string, order: Order, input: SettleOrderInput): Promise<Order> {
  if (IS_LIVE_API) return liveSettleDeliveryOrder(order.id, input);

  const book = read();
  const run =
    book.assignments
      .filter((a) => a.orderId === order.id && a.status === 'DELIVERED')
      .sort((a, b) => Date.parse(b.deliveredAt ?? b.assignedAt) - Date.parse(a.deliveredAt ?? a.assignedAt))[0] ?? null;
  // Cash when it was taken at the door (or nobody is recorded to say otherwise); card when it was paid up front.
  const done = await mockOrders.settleDeliveryOrder(actor, order.id, run && run.cashToCollect === 0 ? 'CARD' : 'CASH');
  if (!run) return done;

  const fresh = read();
  const base = { branchId, accountKind: run.accountKind, accountId: run.accountId, orderId: order.id, offset: 0, note: `Order ${order.reference}`, at: now() };
  const added: Settlement[] = [];
  if ((run.cashCollected ?? 0) > 0) added.push({ id: uid('st'), ...base, direction: 'COLLECT', amount: run.cashCollected ?? 0, method: 'CASH' });
  if (input.payFee && run.courierFee > 0) added.push({ id: uid('st'), ...base, direction: 'PAYOUT', amount: run.courierFee, method: input.feeMethod });
  write({ ...fresh, settlements: [...fresh.settlements, ...added] });
  return done;
}
