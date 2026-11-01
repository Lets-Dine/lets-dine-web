import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { fetchCustomerProfile, listCustomers } from '../../api/customers';
import type { StaffOrderInput } from '../../api/live-admin';
import { STAFF_ORDERS_ENABLED, createStaffOrder, fetchOrdersBySession, listFloors, listTables } from '../../api/staff';
import { randomId } from '../../api/store';
import { formatMoney } from '../../domain/money';
import type { CustomerListItem, DiningTable, Order } from '../../domain/types';
import { haptic } from '../../platform/haptics';
import { useDashboard } from '../../routes/admin/AdminLayout';
import { isOccupied } from '../../routes/admin/Tables';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useToast } from '../../state/ToastContext';
import { QuantityStepper } from '../Bits';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Plus, Search, X } from '../icons';
import { DISPLAY, cx } from '../ui';
import { DishOptionsDialog } from './DishOptionsDialog';
import { DishMenu, useTicketDraft } from './DishTilePicker';
import { useCommand } from './kit';
import { useCountUp } from './profile';

type Kind = 'TABLE' | 'FLOOR' | 'DELIVERY';
/** The questions the docket asks, in the order it asks them. Dishes is where it comes to rest. */
type Ask = 'kind' | 'where' | 'guest' | 'address' | 'dishes';
interface Guest {
  id?: string;
  name: string;
  phone: string;
}

const KINDS: Record<Kind, { name: string; service: string; detail: string }> = {
  TABLE: { name: 'Table', service: 'Table service', detail: 'Seats a free table, or joins one already eating' },
  FLOOR: { name: 'Floor', service: 'Floor service', detail: 'A cabin, room or spot on one of the floors' },
  DELIVERY: { name: 'Delivery', service: 'Delivery', detail: 'Cooked here, sent out to the guest’s door' },
};

/** A docket's foot is torn from the pad — 14px teeth along the bottom edge. */
const TORN_FOOT: CSSProperties = {
  WebkitMask: 'conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 14px 100%',
  mask: 'conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 14px 100%',
};

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** "Table 12" → "12", "Patio" → "PA": what fits on the round table top. */
const tableMark = (name: string) =>
  name.match(/(\d+)\s*$/)?.[1] ??
  name
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 2)
    .toUpperCase();

/**
 * "New order" — staff placing an order at the till, from the dashboard or the pass. The button
 * hides where staff can't place one (the offline demo, or a role without `orders:advance`).
 * N opens it from anywhere on the page.
 */
export function NewOrderButton({ className }: { className?: string }) {
  const { allows } = useAuth();
  const [open, setOpen] = useState(false);
  const enabled = STAFF_ORDERS_ENABLED && allows('orders:advance');

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (document.querySelector('dialog[open], [aria-modal="true"]')) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  if (!enabled) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptic.tick();
          setOpen(true);
        }}
        aria-keyshortcuts="N"
        className={cx(
          'inline-flex h-12 items-center gap-2 rounded-full bg-surface-2 pl-5 pr-4 text-[15px] font-semibold text-ink ring-1 ring-hairline ring-inset transition-[scale,box-shadow] duration-200 hover:ring-hairline-strong active:scale-95',
          className,
        )}
      >
        <Plus size={16} />
        New order
        <kbd className="ml-1 hidden h-6 min-w-6 place-items-center rounded-md bg-surface px-1.5 font-sans text-[11.5px] font-semibold text-ink-4 ring-1 ring-hairline ring-inset sm:grid">
          N
        </kbd>
      </button>
      {open && <NewOrderComposer onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The order is a kitchen docket that writes itself. One question is asked at a time beside the
 * docket, and each answer is inked onto it as a line — the docket is the progress, the summary and
 * the place-order control at once. Tapping a line asks its question again. When the menu opens the
 * window widens to hold it, and narrows again when a line is reopened.
 *
 * A table with a running visit gets the order added to it; a free one is seated as the order goes
 * in. Placed orders are accepted on the spot and go straight to the kitchen.
 */
function NewOrderComposer({ onClose }: { onClose: () => void }) {
  const staff = useStaff();
  const push = useToast();
  const { menu, applyOrder, reloadOrders } = useDashboard();
  const { busy, run } = useCommand();
  const ticket = useTicketDraft(menu);
  const shownTotal = useCountUp(ticket.total, 400);
  const [openedAt] = useState(() => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  // One per order as typed: a double tap or a retry after a dropped connection lands as the same order,
  // but an order changed after a failed attempt is a new one, not a replay of the old.
  const idempotency = useRef({ payload: '', key: '' });

  const tables = useAsync(() => listTables(staff), [staff]);
  const floors = useAsync(() => listFloors(staff), [staff]);
  const setupLoading = (!tables.data && !tables.error) || (!floors.data && !floors.error);
  const activeTables = useMemo(() => (tables.data ?? []).filter((t) => t.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [tables.data]);
  const activeFloors = useMemo(() => (floors.data ?? []).filter((f) => f.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [floors.data]);
  const kinds = useMemo(() => {
    const list: Kind[] = [];
    if (activeTables.length > 0) list.push('TABLE');
    if (activeFloors.length > 0) list.push('FLOOR');
    if (menu.restaurant.deliveryEnabled) list.push('DELIVERY');
    return list;
  }, [activeTables.length, activeFloors.length, menu.restaurant.deliveryEnabled]);

  const [chosenKind, setKind] = useState<Kind | null>(null);
  const kind = chosenKind && kinds.includes(chosenKind) ? chosenKind : kinds.length === 1 ? kinds[0] : null;
  const [tableId, setTableId] = useState<string | null>(null);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [spot, setSpot] = useState('');
  const [spotDone, setSpotDone] = useState(false);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  const [address, setAddress] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [addressDone, setAddressDone] = useState(false);
  const [reopened, setReopened] = useState<Ask | null>(null);
  const [docketOpen, setDocketOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const table = activeTables.find((t) => t.id === tableId) ?? null;
  const floor = activeFloors.find((f) => f.id === floorId) ?? null;
  const seated = kind === 'TABLE' && !!table && isOccupied(table);
  // A table's visit belongs to whoever its first order named — the server keeps them, so show that instead of asking.
  const visit = useAsync(
    () => (seated && table?.currentSessionId ? fetchOrdersBySession(staff, table.currentSessionId) : Promise.resolve([] as Order[])),
    [staff, seated, table?.currentSessionId],
  );
  // Only this table's current visit counts — while another table's answer is still on screen, nothing is locked.
  const owner = seated ? visit.data?.find((o) => o.sessionId === table?.currentSessionId && o.customerName) : undefined;
  const lockedTo: Guest | null = owner ? { name: owner.customerName ?? '', phone: owner.customerPhone ?? '' } : null;
  const who = lockedTo ?? guest;

  const answered: Record<Ask, boolean> = {
    kind: kind !== null,
    where: kind === 'TABLE' ? !!table : kind === 'FLOOR' ? !!floor && spotDone : kind === 'DELIVERY',
    guest: kind === 'DELIVERY' ? !!guest : !!who || walkIn,
    address: kind !== 'DELIVERY' || (addressDone && !!address.trim()),
    dishes: ticket.draft.length > 0,
  };
  const firstOpen = (['kind', 'where', 'guest', 'address'] as const).find((a) => !answered[a]) ?? 'dishes';
  const ask: Ask = reopened ?? firstOpen;
  const wide = ask === 'dishes';
  /** The question on screen was just answered: go to whatever is still unanswered, else the menu. */
  const answer = () => {
    haptic.tick();
    setReopened(null);
  };
  const reopen = (a: Ask) => {
    haptic.tick();
    setDocketOpen(false);
    setReopened(a === firstOpen ? null : a);
  };

  // The questions this order actually asks, in order — what the back link above each question walks.
  const path: Ask[] = [
    ...(kinds.length > 1 ? (['kind'] as const) : []),
    ...(kind !== 'DELIVERY' ? (['where'] as const) : []),
    'guest',
    ...(kind === 'DELIVERY' ? (['address'] as const) : []),
    'dishes',
  ];
  const previous = path[path.indexOf(ask) - 1];
  const answerOf: Record<Ask, string | undefined> = {
    kind: kind ? KINDS[kind].service : undefined,
    where: kind === 'FLOOR' ? floor?.name : table?.name,
    guest: lockedTo?.name ?? guest?.name ?? (walkIn ? 'Walk-in' : undefined),
    address: address.trim() || undefined,
    dishes: undefined,
  };
  /** Back is a correction, not a step: it reopens the answer before this one, named by what was answered. */
  const back = previous ? { text: answerOf[previous] ?? 'Back', onClick: () => reopen(previous) } : undefined;

  const pickKind = (next: Kind) => {
    setKind(next);
    answer();
  };
  const reloadTables = tables.reload;
  useEffect(() => {
    // A table seated since the window opened must read as seated before it's picked.
    if (ask === 'where' && kind === 'TABLE') reloadTables();
  }, [ask, kind, reloadTables]);

  const pickedId = useRef<string | null>(null);
  const pickGuest = (next: Guest | null) => {
    setGuest(next);
    setWalkIn(false);
    setAddress('');
    setAddressDone(false);
    pickedId.current = next?.id ?? null;
    // A regular's saved address comes back with them; a late answer for someone already swapped out is dropped.
    if (next?.id)
      fetchCustomerProfile(next.id)
        .then((p) => pickedId.current === next.id && setAddress((current) => current || p.defaultAddress || ''))
        .catch(() => undefined);
  };

  const ready = answered.kind && answered.where && answered.guest && answered.address && answered.dishes;
  const missing = !answered.kind
    ? 'Choose the kind of order'
    : !answered.where
      ? kind === 'FLOOR'
        ? 'Choose the floor'
        : 'Choose the table'
      : !answered.guest
        ? 'Add the guest'
        : !answered.address
          ? 'Add the address'
          : 'Add a dish to place it';

  const place = () => {
    if (!ready || !kind) return;
    const input: StaffOrderInput = {
      type: kind,
      tableId: kind === 'TABLE' ? table?.id : undefined,
      floorId: kind === 'FLOOR' ? floor?.id : undefined,
      lines: ticket.draft.map((l) => ({ dishId: l.dish.id, quantity: l.qty, variantId: l.variantId ?? undefined, addOnIds: l.addOnIds })),
      customer: guest && !lockedTo ? { phone: guest.phone.trim(), name: guest.name.trim() } : undefined,
      floorVisitorName: kind === 'FLOOR' && spot.trim() ? spot.trim() : undefined,
      deliveryAddress: kind === 'DELIVERY' ? address.trim() : undefined,
      deliveryNote: kind === 'DELIVERY' && deliveryNote.trim() ? deliveryNote.trim() : undefined,
    };
    const payload = JSON.stringify(input);
    if (idempotency.current.payload !== payload) idempotency.current = { payload, key: randomId() };
    const { key } = idempotency.current;
    let placed: Order | null = null;
    void run('place', async () => {
      placed = await createStaffOrder(input, key);
    }).then((ok) => {
      const order = placed as Order | null;
      if (!ok || !order) return;
      applyOrder(order);
      reloadOrders();
      haptic.success();
      // Someone may have accepted it on the pass first; either way it's in — say where it actually is.
      push(`${order.reference} placed · ${order.status === 'PENDING' ? 'waiting on the pass' : 'sent to the kitchen'}`, <Check size={16} />);
      onClose();
    });
  };

  const hasProgress = ticket.draft.length > 0 || !!guest || !!table || !!floor;
  const requestClose = () => {
    // Mid-placement the order may already be in — let the answer land rather than offer to discard it.
    if (busy) return;
    if (!hasProgress) return onClose();
    haptic.warn();
    setDiscarding(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (ticket.configuring) return;
        if (discarding) setDiscarding(false);
        else if (docketOpen) setDocketOpen(false);
        else requestClose();
        return;
      }
      // 1, 2, 3 choose the kind of order while that's the question.
      const n = Number(e.key);
      if (ask === 'kind' && n >= 1 && n <= kinds.length && !typing(e.target) && !e.metaKey && !e.ctrlKey) pickKind(kinds[n - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The browser's Back button walks the flow instead of leaving the page: it closes whatever is on top, then
  // reopens the previous answer, and from the first question offers to discard. The held history entry is
  // put back on every pop, as other modals do (see `useDiscardBack`), and dropped when the window closes.
  const onBack = useRef(() => {});
  useEffect(() => {
    onBack.current = () => {
      if (ticket.configuring) ticket.setConfiguring(null);
      else if (discarding) setDiscarding(false);
      else if (docketOpen) setDocketOpen(false);
      else if (back) back.onClick();
      else requestClose();
    };
  });
  // Dropping our own entry on cleanup fires a popstate of its own — in dev, React's double-mount delivers it to
  // the second mount, which must not read it as the user pressing Back.
  const ownPops = useRef(0);
  useEffect(() => {
    const hold = () => window.history.pushState(window.history.state, '');
    const pop = () => {
      hold();
      if (ownPops.current > 0) ownPops.current -= 1;
      else onBack.current();
    };
    hold();
    window.addEventListener('popstate', pop);
    return () => {
      window.removeEventListener('popstate', pop);
      ownPops.current += 1;
      window.history.back();
    };
  }, []);

  // A question that didn't put the cursor in a field hands focus to itself, so a screen reader hears it.
  const questionRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (document.activeElement === document.body) questionRef.current?.focus();
  }, [ask]);

  const money = (v: number) => formatMoney(v, menu.restaurant.currency);
  const items = ticket.draft.reduce((n, l) => n + l.qty, 0);

  /* ── The question ─────────────────────────────────────────────── */

  let question: ReactNode;
  if (setupLoading) {
    question = <p className="px-10 py-16 text-[15px] text-ink-3">Reading the room…</p>;
  } else if (kinds.length === 0) {
    question = (
      <Question
        key={ask}
        headingRef={questionRef}
        title="Nowhere to send it yet"
        lede="Add a table or a floor, or turn on delivery, and orders can be placed from here."
      >
        {null}
      </Question>
    );
  } else if (ask === 'kind') {
    question = (
      <Question key={ask} headingRef={questionRef} back={back} title="What kind of order?">
        <ul className="border-y border-hairline">
          {kinds.map((k, i) => (
            <li key={k} className="border-b border-hairline last:border-b-0">
              <button
                type="button"
                autoFocus={i === 0}
                onClick={() => pickKind(k)}
                className="group flex w-full items-center gap-5 py-5 text-left outline-none focus-visible:bg-surface-2/60"
              >
                <kbd className="hidden w-5 shrink-0 font-sans text-[12px] font-semibold text-ink-4 tnum sm:block">{i + 1}</kbd>
                <span className="min-w-0 flex-1">
                  <span
                    className={cx(
                      DISPLAY,
                      'block text-[28px] leading-none transition-colors duration-200 group-hover:text-flame-1',
                      kind === k && 'text-flame-1',
                    )}
                  >
                    {KINDS[k].name}
                  </span>
                  <span className="mt-2 block text-[14px] text-ink-3">{KINDS[k].detail}</span>
                </span>
                <ChevronRight
                  size={20}
                  className="shrink-0 -translate-x-1.5 text-flame-1 opacity-0 transition-[opacity,translate] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                />
              </button>
            </li>
          ))}
        </ul>
      </Question>
    );
  } else if (ask === 'where' && kind === 'TABLE') {
    const free = activeTables.filter((t) => !isOccupied(t)).length;
    question = (
      <Question
        key={ask}
        headingRef={questionRef}
        title="Which table?"
        lede={
          <>
            {free} free, {activeTables.length - free} eating. A table that’s eating gets this added to its running bill.
          </>
        }
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-x-3 gap-y-5" role="radiogroup" aria-label="Table">
          {activeTables.map((t, i) => (
            <TableToken
              key={t.id}
              table={t}
              on={t.id === tableId}
              autoFocus={t.id === tableId || (!tableId && i === 0)}
              onPick={() => {
                setTableId(t.id);
                answer();
              }}
            />
          ))}
        </div>
      </Question>
    );
  } else if (ask === 'where' && kind === 'FLOOR') {
    question = (
      <Question key={ask} headingRef={questionRef} back={back} title="Which floor?" lede="Then, if it helps the runner, the cabin or spot on it.">
        <ul className="border-y border-hairline">
          {activeFloors.map((f, i) => {
            const on = f.id === floorId;
            return (
              <li key={f.id} className="border-b border-hairline last:border-b-0">
                <button
                  type="button"
                  autoFocus={on || (!floorId && i === 0)}
                  aria-pressed={on}
                  onClick={() => {
                    haptic.tick();
                    setFloorId(f.id);
                    setSpotDone(false);
                  }}
                  className="group flex w-full items-center gap-4 py-4 text-left outline-none focus-visible:bg-surface-2/60"
                >
                  <span
                    className={cx(DISPLAY, 'min-w-0 flex-1 truncate text-[24px] transition-colors group-hover:text-flame-1', on && 'text-flame-1')}
                  >
                    {f.name}
                  </span>
                  {on ? <Check size={18} className="text-flame-1" /> : <ChevronRight size={18} className="text-ink-4" />}
                </button>
                {on && (
                  <form
                    className="flex animate-rise flex-wrap items-end gap-x-5 gap-y-3 pb-5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setSpotDone(true);
                      answer();
                    }}
                  >
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Spot on {f.name}</span>
                      <input
                        autoFocus
                        value={spot}
                        onChange={(e) => setSpot(e.target.value)}
                        maxLength={60}
                        placeholder="Cabin, room or spot"
                        className="h-11 w-full border-b-2 border-hairline-strong bg-transparent text-[18px] outline-none transition-colors placeholder:text-ink-4 focus:border-flame"
                      />
                    </label>
                    <button type="submit" className="inline-flex h-11 items-center gap-1.5 text-[15px] font-semibold text-flame-1 hover:opacity-80">
                      {spot.trim() ? 'That’s the spot' : 'No particular spot'} <ChevronRight size={16} />
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Question>
    );
  } else if (ask === 'guest') {
    if (seated && visit.loading) {
      question = (
        <Question key={ask} headingRef={questionRef} back={back} title="Who’s it for?" lede={`Checking who ${table?.name} is billed to…`}>
          {null}
        </Question>
      );
    } else if (lockedTo) {
      question = (
        <Question
          key={ask}
          headingRef={questionRef}
          back={back}
          title="Who’s it for?"
          lede={
            <>
              {table?.name}’s visit is already billed to <b className="font-semibold text-ink">{lockedTo.name}</b>, so this order goes on their bill
              too.
            </>
          }
        >
          <TextAction autoFocus onClick={answer}>
            On to the dishes
          </TextAction>
        </Question>
      );
    } else {
      question = (
        <Question
          key={ask}
          headingRef={questionRef}
          back={back}
          title="Who’s it for?"
          lede={
            kind === 'DELIVERY'
              ? 'The phone number is how the rider reaches them.'
              : 'Optional at a table — a name links the order to their visits and points.'
          }
        >
          <GuestSearch
            current={guest}
            onPick={(g) => {
              pickGuest(g);
              answer();
            }}
          />
          {kind !== 'DELIVERY' && (
            <TextAction
              className="mt-8"
              quiet
              onClick={() => {
                pickGuest(null);
                setWalkIn(true);
                answer();
              }}
            >
              Walk-in — no name needed
            </TextAction>
          )}
        </Question>
      );
    }
  } else if (ask === 'address') {
    question = (
      <Question key={ask} headingRef={questionRef} back={back} title="Where’s it going?" lede={guest ? `Delivering to ${guest.name}.` : undefined}>
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!address.trim()) return;
            setAddressDone(true);
            answer();
          }}
        >
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-ink-3">Address</span>
            <textarea
              autoFocus
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              maxLength={500}
              placeholder="Street, area, landmark"
              className="w-full resize-none border-b-2 border-hairline-strong bg-transparent py-2 text-[20px] leading-snug outline-none transition-colors placeholder:text-ink-4 focus:border-flame"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-ink-3">Note for the rider · optional</span>
            <input
              value={deliveryNote}
              onChange={(e) => setDeliveryNote(e.target.value)}
              maxLength={280}
              placeholder="Gate code, call on arrival…"
              className="h-11 w-full border-b-2 border-hairline-strong bg-transparent text-[17px] outline-none transition-colors placeholder:text-ink-4 focus:border-flame"
            />
          </label>
          <TextAction type="submit" disabled={!address.trim()}>
            On to the dishes
          </TextAction>
        </form>
      </Question>
    );
  } else {
    question = (
      <DishMenu
        menu={menu}
        busy={busy}
        counts={ticket.counts}
        lines={ticket.draft}
        onPick={ticket.pick}
        onQty={ticket.changeQty}
        heading={
          <div className="px-4 pb-1 pt-5 sm:px-6">
            {back && <BackLink {...back} />}
            <h2
              ref={questionRef}
              tabIndex={-1}
              id="new-order-question"
              className={cx(DISPLAY, 'text-[28px] leading-none tracking-[-0.025em] outline-none sm:text-[32px]')}
            >
              What are they having?
            </h2>
          </div>
        }
      />
    );
  }

  /* ── The docket ───────────────────────────────────────────────── */

  const docket = (
    <div className="flex min-h-0 max-h-full w-full max-w-[340px] flex-col" style={{ filter: 'drop-shadow(0 16px 28px rgb(20 10 2 / 0.32))' }}>
      <div className="flex min-h-0 flex-col bg-docket-surface pb-6 text-docket-ink" style={TORN_FOOT}>
        <header className="flex items-start justify-between gap-3 px-6 pb-4 pt-6">
          <div>
            <p className={cx(DISPLAY, 'text-[22px] leading-none')}>New order</p>
            <p className="mt-1.5 text-[12px] text-docket-inksoft">Taken by {staff.name.split(' ')[0]}</p>
          </div>
          <span className="pt-1 font-mono text-[12px] text-docket-inksoft tnum">{openedAt}</span>
        </header>
        <Rule />

        <div className="space-y-0.5 px-3 py-3">
          {kinds.length > 1 && (
            <DocketLine
              label="Order"
              active={ask === 'kind'}
              onEdit={answered.kind ? () => reopen('kind') : undefined}
              value={kind ? KINDS[kind].service : null}
            />
          )}
          {kind !== 'DELIVERY' && (
            <DocketLine
              label={kind === 'FLOOR' ? 'Floor' : 'Table'}
              active={ask === 'where'}
              onEdit={answered.kind ? () => reopen('where') : undefined}
              value={kind === 'FLOOR' ? (floor && spotDone ? floor.name : null) : table?.name}
              sub={
                kind === 'FLOOR'
                  ? spot.trim() || undefined
                  : table
                    ? isOccupied(table)
                      ? 'Joins the running bill'
                      : 'Seats the table now'
                    : undefined
              }
            />
          )}
          <DocketLine
            label="Guest"
            active={ask === 'guest'}
            onEdit={answered.where ? () => reopen('guest') : undefined}
            value={who ? who.name : walkIn ? 'Walk-in' : seated && visit.loading ? 'Checking the visit…' : null}
            sub={who ? [who.phone, lockedTo ? 'Already on this table’s bill' : ''].filter(Boolean).join(' · ') || undefined : undefined}
          />
          {kind === 'DELIVERY' && (
            <DocketLine
              label="Deliver to"
              active={ask === 'address'}
              onEdit={answered.guest ? () => reopen('address') : undefined}
              value={addressDone ? address.trim() : null}
              sub={addressDone ? deliveryNote.trim() || undefined : undefined}
            />
          )}
        </div>

        <Rule label={items > 0 ? `${items} item${items === 1 ? '' : 's'}` : 'Dishes'} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-2">
          {ticket.draft.length === 0 ? (
            <p className="py-5 text-center text-[13px] text-docket-inksoft">{wide ? 'Tap a dish to write it on.' : 'Dishes come after the guest.'}</p>
          ) : (
            <ul>
              {ticket.draft.map((l) => {
                const detail = ticket.describe(l);
                return (
                  <li key={l.key} className="flex items-start gap-3 py-2.5">
                    {wide ? (
                      <QuantityStepper value={l.qty} onChange={(n) => ticket.changeQty(l.key, n - l.qty)} size="sm" min={0} />
                    ) : (
                      <span className="w-6 shrink-0 pt-px text-[14px] font-semibold text-docket-inksoft tnum">{l.qty}×</span>
                    )}
                    <span className="min-w-0 flex-1 animate-ink">
                      <span className="block text-[14.5px] font-semibold leading-snug">{l.dish.name}</span>
                      {detail && <span className="block text-[12px] text-docket-inksoft">{detail}</span>}
                    </span>
                    <span className="shrink-0 pt-px text-[13.5px] tnum">{money(ticket.priceOf(l) * l.qty)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Rule thick />
        <div className="flex items-baseline justify-between gap-3 px-6 pt-4">
          <span className="text-[12px] text-docket-inksoft">
            Subtotal
            <span className="block text-[11px]">before tax &amp; service</span>
          </span>
          <span className={cx(DISPLAY, 'text-[26px] leading-none tnum')}>{money(shownTotal)}</span>
        </div>
        <div className="px-5 pt-5">
          <button
            type="button"
            onClick={place}
            disabled={!ready || busy}
            aria-describedby={ready ? undefined : 'docket-missing'}
            className={cx(
              'inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold transition-[scale,background-color,box-shadow,opacity] duration-300 active:scale-[0.98]',
              ready ? 'bg-flame text-white shadow-flame' : 'cursor-not-allowed bg-docket-line text-docket-inksoft',
              busy && 'opacity-70',
            )}
          >
            {busy ? 'Sending to the kitchen…' : 'Place order'}
          </button>
          <p id="docket-missing" className={cx('mt-2.5 text-center text-[12px] text-docket-inksoft', ready && 'invisible')} aria-live="polite">
            {ready ? '·' : missing}
          </p>
        </div>
      </div>
    </div>
  );

  // Portalled: the page headers that host the button animate in, and a transformed ancestor would trap a fixed overlay.
  return createPortal(
    <>
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-2 backdrop-blur-[3px] sm:p-6" role="presentation">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-order-question"
          className={cx(
            'animate-pop relative flex w-full overflow-hidden rounded-[28px] bg-surface text-ink shadow-deep ring-1 ring-hairline ring-inset',
            'transition-[max-width,height] duration-[560ms] ease-out-quart motion-reduce:transition-none',
            wide ? 'h-[min(880px,96dvh)] max-w-[1260px]' : 'h-[min(680px,96dvh)] max-w-[960px]',
          )}
        >
          <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <button
              type="button"
              aria-label="Close"
              onClick={requestClose}
              className="absolute right-3 top-3 z-10 grid size-11 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink md:hidden"
            >
              <X size={18} />
            </button>
            {wide ? question : <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{question}</div>}

            {/* Below md the docket folds into a bar at the foot; tap it to read the whole slip. */}
            <div className="flex shrink-0 items-center gap-3 border-t border-hairline bg-bg px-4 py-3 md:hidden">
              <button type="button" onClick={() => setDocketOpen(true)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">
                    {[kind === 'TABLE' ? table?.name : kind === 'FLOOR' ? floor?.name : kind && KINDS[kind].service, who?.name]
                      .filter(Boolean)
                      .join(' · ') || 'New order'}
                  </span>
                  <span className="block text-[12.5px] text-ink-3 tnum">
                    {items} item{items === 1 ? '' : 's'} · {money(shownTotal)}
                  </span>
                </span>
                <ChevronDown size={16} className="shrink-0 rotate-180 text-ink-4" />
              </button>
              <button
                type="button"
                onClick={place}
                disabled={!ready || busy}
                className={cx(
                  'h-11 shrink-0 rounded-full px-5 text-[14px] font-semibold transition-[scale,opacity] active:scale-95',
                  ready ? 'bg-flame text-white shadow-flame' : 'bg-surface-2 text-ink-4',
                )}
              >
                {busy ? 'Sending…' : 'Place'}
              </button>
            </div>
          </section>

          <aside
            className={cx(
              'flex-col items-center border-l border-hairline bg-bg px-5 pb-6 pt-5',
              docketOpen ? 'absolute inset-0 z-20 flex animate-rise' : 'hidden md:flex md:w-[360px] md:shrink-0 lg:w-[380px]',
            )}
            aria-label="The docket"
          >
            <div className="mb-4 flex w-full max-w-[340px] items-center justify-end">
              <button
                type="button"
                aria-label={docketOpen ? 'Back to the order' : 'Close'}
                onClick={docketOpen ? () => setDocketOpen(false) : requestClose}
                className="grid size-10 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {docketOpen ? <ChevronDown size={18} /> : <X size={18} />}
              </button>
            </div>
            {docket}
          </aside>
        </div>
      </div>

      {ticket.configuring && (
        <DishOptionsDialog
          dish={ticket.configuring}
          menu={menu}
          onClose={() => ticket.setConfiguring(null)}
          onAdd={(sel) => {
            ticket.add(ticket.configuring!, sel);
            ticket.setConfiguring(null);
          }}
        />
      )}

      {discarding && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" role="presentation" onClick={() => setDiscarding(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-title"
            className="w-full max-w-sm animate-pop rounded-3xl bg-surface p-6 text-ink shadow-deep ring-1 ring-hairline ring-inset"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="discard-title" className={cx(DISPLAY, 'text-[22px]')}>
              Tear up this docket?
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-3">Nothing has gone to the kitchen yet.</p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setDiscarding(false)}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-surface-2 text-[14px] font-semibold ring-1 ring-hairline ring-inset transition-transform active:scale-95"
              >
                Keep writing
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-berry/14 text-[14px] font-semibold text-berry ring-1 ring-berry/30 ring-inset transition-transform active:scale-95"
              >
                Tear it up
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}

/** One question, set large beside the docket; whatever answers it sits below. */
function Question({
  title,
  lede,
  headingRef,
  back,
  children,
}: {
  title: string;
  lede?: ReactNode;
  headingRef: RefObject<HTMLHeadingElement | null>;
  back?: { text: string; onClick: () => void };
  children: ReactNode;
}) {
  return (
    <div className="animate-rise px-6 pb-10 pt-6 sm:px-10 sm:pt-8">
      {back ? <BackLink {...back} /> : <div className="h-8 sm:mb-3" aria-hidden />}
      <h2
        ref={headingRef}
        tabIndex={-1}
        id="new-order-question"
        className={cx(DISPLAY, 'text-[30px] leading-[1.05] tracking-[-0.025em] outline-none sm:text-[38px]')}
      >
        {title}
      </h2>
      {lede && <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-ink-3">{lede}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}

/** Above each question: the answer before it, ready to be changed. */
function BackLink({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Back to change ${text}`}
      className="group -ml-1.5 mb-3 inline-flex h-8 max-w-full items-center gap-1 rounded-lg px-1.5 text-[13.5px] font-semibold text-ink-3 outline-none transition-colors hover:text-ink focus-visible:bg-surface-2"
    >
      <ChevronLeft size={16} className="shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5" />
      <span className="truncate">{text}</span>
    </button>
  );
}

/** A dashed tear line across the docket, optionally carrying a small label in its middle. */
function Rule({ label, thick = false }: { label?: string; thick?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-6" aria-hidden={!label}>
      <span className={cx('h-0 flex-1 border-t border-dashed border-docket-line', thick && 'border-t-2')} />
      {label && <span className="shrink-0 text-[11px] font-semibold text-docket-inksoft tnum">{label}</span>}
      {label && <span className="h-0 flex-1 border-t border-dashed border-docket-line" />}
    </div>
  );
}

/**
 * One line of the docket. Unanswered, it's a blank ruled line waiting to be written on; answered,
 * the value is inked in (re-inked whenever it changes) and the line reopens its question on tap.
 */
function DocketLine({
  label,
  value,
  sub,
  active,
  onEdit,
}: {
  label: string;
  value: string | null | undefined;
  sub?: string;
  active: boolean;
  onEdit?: () => void;
}) {
  const editable = !!value && !!onEdit && !active;
  const body = (
    <>
      <span className={cx('flex items-center gap-1.5 text-[11.5px] font-semibold', active ? 'text-flame-1' : 'text-docket-inksoft')}>
        {active && <span className="size-1.5 animate-breathe rounded-full bg-flame" aria-hidden />}
        {label}
        {editable && (
          <span className="ml-auto text-docket-inksoft/80 underline decoration-dotted underline-offset-[3px] transition-colors group-hover:text-flame-1 group-focus-visible:text-flame-1">
            Change
          </span>
        )}
      </span>
      {value ? (
        <span key={value} className="mt-0.5 block animate-ink">
          <span className={cx(DISPLAY, 'block whitespace-pre-line wrap-break-word text-[19px] leading-snug')}>{value}</span>
          {sub && <span className="block wrap-break-word text-[12.5px] text-docket-inksoft tnum">{sub}</span>}
        </span>
      ) : (
        <span className={cx('mt-3 mb-1.5 block border-b border-dotted', active ? 'border-flame/60' : 'border-docket-line')} aria-hidden />
      )}
    </>
  );
  if (!editable) return <div className="rounded-xl px-3 py-2">{body}</div>;
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Change ${label.toLowerCase()}: ${value}`}
      className="group block w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-docket-line/50 focus-visible:bg-docket-line/50 focus-visible:outline-none"
    >
      {body}
    </button>
  );
}

/** A table drawn from above: its top carries the number, its chairs ring it, its state is its colour. */
function TableToken({ table, on, autoFocus, onPick }: { table: DiningTable; on: boolean; autoFocus: boolean; onPick: () => void }) {
  const eating = isOccupied(table);
  const chairs = Math.min(Math.max(table.capacity, 1), 12);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      autoFocus={autoFocus}
      onClick={onPick}
      aria-label={`${table.name}, ${eating ? 'eating now' : `free, seats ${table.capacity}`}`}
      className="group flex flex-col items-center rounded-2xl py-2 outline-none transition-[scale] duration-150 active:scale-95 focus-visible:bg-surface-2/60"
    >
      <span className="relative grid size-[88px] place-items-center">
        {Array.from({ length: chairs }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className={cx('absolute left-1/2 top-1/2 -ml-[4px] -mt-[4px] size-2 rounded-full', eating ? 'bg-occupied/70' : 'bg-ink-4/45')}
            style={{ transform: `rotate(${(i * 360) / chairs}deg) translateY(-38px)` }}
          />
        ))}
        <span
          className={cx(
            DISPLAY,
            'grid size-[58px] place-items-center rounded-full text-[21px] ring-inset transition-[box-shadow,background-color,color] duration-200',
            on
              ? 'bg-flame text-white shadow-flame ring-0'
              : eating
                ? 'bg-occupied/14 text-ink ring-1 ring-occupied/45 group-hover:ring-2'
                : 'bg-surface-2 text-ink ring-1 ring-hairline-strong group-hover:ring-2 group-hover:ring-flame/50',
          )}
        >
          {tableMark(table.name)}
        </span>
      </span>
      <span className="mt-1 w-full truncate px-1 text-center text-[13.5px] font-semibold">{table.name}</span>
      <span className={cx('text-[12px]', eating ? 'text-flame-1' : 'text-ink-3')}>{eating ? 'Eating' : `Free · ${table.capacity}`}</span>
    </button>
  );
}

/** The one way forward on a question that isn't answered by a tap: a flame text link with an arrow. */
function TextAction({
  children,
  onClick,
  type = 'button',
  disabled,
  autoFocus,
  quiet,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  autoFocus?: boolean;
  quiet?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      className={cx(
        'group inline-flex h-11 items-center gap-1.5 rounded-lg text-[15.5px] font-semibold outline-none transition-[color,opacity] focus-visible:underline disabled:opacity-35',
        quiet ? 'text-ink-3 hover:text-ink' : 'text-flame-1 hover:opacity-85',
        className,
      )}
    >
      {children}
      <ChevronRight size={17} className="transition-transform duration-200 group-hover:translate-x-0.5" />
    </button>
  );
}

/** Find a regular by name or phone, or write in someone new without leaving the question. */
function GuestSearch({ current, onPick }: { current: Guest | null; onPick: (g: Guest) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ q: string; rows: CustomerListItem[] }>({ q: '', rows: [] });
  const [adding, setAdding] = useState<{ phone: string; name: string } | null>(null);
  const needle = query.trim();
  // Only an answer to exactly what's typed now — Enter during the debounce must not pick the last query's match.
  const matches = needle.length >= 2 && results.q === needle ? results.rows : [];

  useEffect(() => {
    if (needle.length < 2) return;
    let stale = false;
    const timer = window.setTimeout(() => {
      listCustomers({ q: needle, limit: 6 })
        .then((page) => !stale && setResults({ q: needle, rows: page.rows }))
        .catch(() => !stale && setResults({ q: needle, rows: [] }));
    }, 200);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [needle]);

  const underline =
    'w-full border-b-2 border-hairline-strong bg-transparent outline-none transition-colors placeholder:text-ink-4 focus:border-flame';

  if (adding) {
    const ready = adding.phone.replace(/\D/g, '').length >= 6 && adding.name.trim().length > 0;
    return (
      <form
        className="animate-rise space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onPick({ name: adding.name.trim(), phone: adding.phone.trim() });
        }}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-ink-3">Phone</span>
            <input
              autoFocus={!adding.phone}
              inputMode="tel"
              value={adding.phone}
              onChange={(e) => setAdding({ ...adding, phone: e.target.value })}
              maxLength={20}
              className={cx(underline, 'h-12 text-[20px] tnum')}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-ink-3">Name</span>
            <input
              autoFocus={!!adding.phone}
              value={adding.name}
              onChange={(e) => setAdding({ ...adding, name: e.target.value })}
              maxLength={60}
              className={cx(underline, 'h-12 text-[20px]')}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TextAction type="submit" disabled={!ready}>
            Write them on
          </TextAction>
          <button type="button" onClick={() => setAdding(null)} className="text-[14px] font-semibold text-ink-3 transition-colors hover:text-ink">
            Search instead
          </button>
        </div>
      </form>
    );
  }

  const looksLikePhone = /^[\d\s+-]{6,}$/.test(needle);
  const startAdding = () => setAdding(looksLikePhone ? { phone: needle, name: '' } : { phone: '', name: needle });

  return (
    <div>
      <div className="relative">
        <Search size={19} className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-ink-4" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (matches[0]) onPick(matches[0]);
            else if (needle) startAdding();
          }}
          placeholder={current ? `${current.name} — or search someone else` : 'Name or phone number'}
          aria-label="Search guests"
          className={cx(underline, 'h-14 pl-8 text-[22px]')}
        />
      </div>
      <p className="sr-only" role="status">
        {needle.length >= 2 ? `${matches.length} matching guest${matches.length === 1 ? '' : 's'}` : ''}
      </p>

      {matches.length > 0 && (
        <ul className="mt-2" aria-label="Matching guests">
          {matches.map((c) => (
            <li key={c.id} className="border-b border-hairline">
              <button
                type="button"
                onClick={() => onPick(c)}
                className="group flex w-full items-center gap-4 py-3.5 text-left outline-none focus-visible:bg-surface-2/60"
              >
                <span className="min-w-0 flex-1">
                  <span className={cx(DISPLAY, 'block truncate text-[19px] transition-colors group-hover:text-flame-1')}>{c.name}</span>
                  <span className="block truncate text-[13px] text-ink-3 tnum">{c.phone}</span>
                </span>
                {c.visits > 0 && (
                  <span className="shrink-0 text-[12.5px] text-ink-4 tnum">
                    {c.visits} visit{c.visits === 1 ? '' : 's'}
                  </span>
                )}
                <ChevronRight size={17} className="shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-flame-1" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={startAdding}
        className="mt-4 inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-flame-1 transition-opacity hover:opacity-80"
      >
        <Plus size={15} />
        {needle && matches.length === 0 ? `New guest “${needle}”` : 'New guest'}
      </button>
    </div>
  );
}
