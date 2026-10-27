import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { IS_LIVE_API } from '../api/http';
import { acknowledgeTicket, advanceTicket, listTickets, subscribeToStation } from '../api/kitchen';
import type { KitchenTicket } from '../api/kitchen';
import type { KitchenStation } from '../domain/types';
import { Alert, Bell, Clock } from '../components/icons';
import { cx } from '../components/ui';
import { playNewOrderSound } from '../platform/sound';
import { useAuth } from '../state/AuthContext';
import { usePageTitle } from '../state/usePageTitle';

/**
 * A screen for a tablet on the kitchen or bar wall — read from arm's length, touched with
 * wet hands. Tickets arrive live and stay loud until someone taps "Got it", so the pass
 * knows a person (not just an open screen) has seen them. It never changes an order.
 *
 * Sits outside the admin chrome on purpose: no sidebar, nothing to tap by accident.
 */

const STATIONS: Record<string, { station: KitchenStation; label: string }> = {
  kitchen: { station: 'KITCHEN', label: 'Kitchen' },
  bar: { station: 'BAR', label: 'Bar' },
};

/** Lines that still need cooking. A ticket with none left (all ready, served or cancelled) has been bumped. */
function needsWork(line: KitchenTicket['lines'][number]): boolean {
  // A status not sent yet means the ticket is brand new, so nothing has started.
  return line.qtyDelta > 0 && (line.itemStatus === undefined || line.itemStatus === 'PENDING' || line.itemStatus === 'PREPARING');
}

/** What a ticket still asks of the station: nothing to do once cooked, or just a "stop" notice to read. */
function isActive(ticket: KitchenTicket): boolean {
  if (ticket.lines.every((l) => l.qtyDelta < 0)) return !ticket.acknowledgedAt;
  return ticket.lines.some(needsWork);
}

/** Past these, a ticket that has been waiting reads as late. */
const SLOW_MIN = 10;
const LATE_MIN = 20;

function minutesSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

function where(order: KitchenTicket['order']): string {
  if (!order) return '';
  if (order.orderType === 'DELIVERY') return 'Delivery';
  if (order.tableName) return order.tableName;
  return [order.floorName, order.floorVisitorName].filter(Boolean).join(' · ') || 'Dine-in';
}

function byNumber(a: KitchenTicket, b: KitchenTicket): number {
  return a.number - b.number;
}

function upsert(list: KitchenTicket[], ticket: KitchenTicket): KitchenTicket[] {
  return [...list.filter((t) => t.id !== ticket.id), ticket].sort(byNumber);
}

export function Kitchen() {
  const { station: param } = useParams<{ station: string }>();
  const { staff, allows } = useAuth();
  const location = useLocation();
  const target = STATIONS[param ?? ''];
  usePageTitle(target ? `${target.label} screen` : 'Kitchen screen');

  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(true);
  const [soundOn, setSoundOn] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState<string | null>(null);
  // Read inside the socket handler, so flipping sound on doesn't tear down and rejoin the room.
  const soundOnRef = useRef(false);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  const station = target?.station;
  const allowed = Boolean(staff) && allows('orders:view');

  const resync = useCallback(() => {
    if (!station) return;
    listTickets(station)
      .then((rows) => {
        setTickets([...rows].sort(byNumber));
        setLoaded(true);
        setFailed(null);
      })
      .catch((e: unknown) => setFailed(e instanceof Error ? e.message : 'Could not load tickets.'));
  }, [station]);

  useEffect(() => {
    if (!station || !allowed || !IS_LIVE_API) return;
    return subscribeToStation(station, {
      onCreated: (ticket) => {
        if (ticket.station !== station) return;
        setTickets((list) => upsert(list, ticket));
        if (soundOnRef.current) playNewOrderSound();
      },
      onUpdated: (ticket) => ticket.station === station && setTickets((list) => list.map((t) => (t.id === ticket.id ? { ...t, ...ticket } : t))),
      onResync: resync,
      onConnection: setOnline,
    });
  }, [station, allowed, resync]);

  // Ages move on their own; a slow tick is plenty for minutes.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const active = useMemo(() => tickets.filter(isActive), [tickets]);
  const unseen = useMemo(() => active.filter((t) => !t.acknowledgedAt).length, [active]);

  const gotIt = (id: string) => {
    // Optimistic: the tap must land instantly even on a weak link. A failure rolls it back.
    const stamp = new Date().toISOString();
    setTickets((list) => list.map((t) => (t.id === id ? { ...t, acknowledgedAt: stamp } : t)));
    acknowledgeTicket(id).catch(() => setTickets((list) => list.map((t) => (t.id === id ? { ...t, acknowledgedAt: null } : t))));
  };

  const advance = (id: string, status: 'PREPARING' | 'READY') => {
    const stamp = new Date().toISOString();
    // Optimistic, like "Got it": mark the lines now so the card changes under the thumb; the server's copy replaces it.
    setTickets((list) =>
      list.map((t) =>
        t.id === id
          ? { ...t, acknowledgedAt: t.acknowledgedAt ?? stamp, lines: t.lines.map((l) => (needsWork(l) ? { ...l, itemStatus: status } : l)) }
          : t,
      ),
    );
    advanceTicket(id, status)
      .then((ticket) => setTickets((list) => list.map((t) => (t.id === id ? ticket : t))))
      .catch(resync);
  };

  if (!target) return <Navigate to="/kitchen/kitchen" replace />;
  if (!staff) return <Navigate to="/admin/signin" replace state={{ from: location.pathname }} />;

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-hairline-strong bg-bg-deep px-5 py-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">{target.label}</h1>
        <p className={cx('text-xl font-semibold tabular-nums', unseen ? 'text-pending-ink' : 'text-ink-3')} aria-live="polite">
          {unseen ? `${unseen} new` : 'All seen'}
        </p>
        <span className="text-lg text-ink-3 tabular-nums">{active.length} open</span>
        <div className="ml-auto flex items-center gap-3">
          {!soundOn && (
            <button
              type="button"
              onClick={() => {
                setSoundOn(true);
                playNewOrderSound();
              }}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-surface-3 px-5 text-lg font-semibold ring-1 ring-hairline-strong ring-inset active:scale-[0.97]"
            >
              <Bell size={20} /> Turn on sound
            </button>
          )}
          <Link to={`/kitchen/${param === 'bar' ? 'kitchen' : 'bar'}`} className="text-lg text-ink-3 underline underline-offset-4">
            {param === 'bar' ? 'Kitchen' : 'Bar'} screen
          </Link>
        </div>
      </header>

      {!IS_LIVE_API && <Notice tone="warn">This screen needs the live server. Nothing to show in a demo build.</Notice>}
      {IS_LIVE_API && !allowed && <Notice tone="warn">Your account can’t view orders. Sign in with a staff account.</Notice>}
      {IS_LIVE_API && allowed && !online && (
        <Notice tone="alert">Offline — new tickets may be missing. Reconnecting; check this tablet’s internet.</Notice>
      )}
      {failed && online && <Notice tone="alert">{failed}</Notice>}

      <main className="p-4">
        {loaded && active.length === 0 && online && (
          <p className="mt-24 text-center text-2xl text-ink-3">Nothing to make right now.</p>
        )}
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-4">
          {active.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} now={now} onGotIt={() => gotIt(ticket.id)} onAdvance={(status) => advance(ticket.id, status)} />
          ))}
        </ul>
      </main>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'alert' | 'warn'; children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className={cx(
        'flex items-center gap-3 px-5 py-3 text-xl font-semibold',
        tone === 'alert' ? 'bg-berry text-ember' : 'bg-gold text-ember',
      )}
    >
      <Alert size={24} /> {children}
    </div>
  );
}

function TicketCard({
  ticket,
  now,
  onGotIt,
  onAdvance,
}: {
  ticket: KitchenTicket;
  now: number;
  onGotIt: () => void;
  onAdvance: (status: 'PREPARING' | 'READY') => void;
}) {
  const seen = Boolean(ticket.acknowledgedAt);
  const age = minutesSince(ticket.createdAt, now);
  const isVoid = ticket.lines.every((l) => l.qtyDelta < 0);
  // One button, the next thing to do: see it, start it, finish it.
  const cooking = ticket.lines.filter(needsWork).every((l) => l.itemStatus === 'PREPARING');

  return (
    <li
      className={cx(
        'flex flex-col overflow-hidden rounded-2xl bg-surface shadow-lift ring-1 ring-inset',
        seen ? 'opacity-80 ring-hairline' : 'bg-surface-2 ring-2 ring-flame-3',
      )}
    >
      <div className={cx('flex items-baseline gap-3 px-4 pt-3 pb-2', isVoid && 'text-berry-ink')}>
        <span className="font-display text-4xl font-bold tabular-nums">#{ticket.number}</span>
        <span className="min-w-0 flex-1 truncate text-2xl font-semibold">{where(ticket.order)}</span>
        <span
          className={cx(
            'inline-flex items-center gap-1 text-xl font-semibold tabular-nums',
            age >= LATE_MIN ? 'text-berry-ink' : age >= SLOW_MIN ? 'text-gold-ink' : 'text-ink-3',
          )}
        >
          <Clock size={18} /> {age}m
        </span>
      </div>
      {ticket.order && <p className="px-4 pb-2 text-lg text-ink-3">Order {ticket.order.reference}</p>}

      {isVoid && <p className="mx-4 mb-1 w-fit rounded-md bg-berry px-2 py-0.5 text-lg font-bold text-ember">CANCELLED — STOP MAKING</p>}

      <ul className="flex flex-1 flex-col gap-2 border-t border-hairline px-4 py-3">
        {ticket.lines.map((line) => {
          const stop = line.qtyDelta < 0;
          return (
            <li key={line.id} className={cx('text-2xl leading-snug', stop && 'text-berry-ink')}>
              <span className={cx('font-bold tabular-nums', stop && 'line-through')}>
                {stop ? '−' : ''}
                {Math.abs(line.qtyDelta)}×
              </span>{' '}
              <span className={cx('font-semibold', stop && 'line-through')}>{line.dishNameSnapshot}</span>
              {line.variantNameSnapshot && <span className="text-ink-2"> · {line.variantNameSnapshot}</span>}
              {line.addOnNames.length > 0 && <p className="text-xl text-ink-2">+ {line.addOnNames.join(', ')}</p>}
              {line.notes && <p className="text-xl font-semibold text-gold-ink">“{line.notes}”</p>}
            </li>
          );
        })}
      </ul>

      {!seen ? (
        <button type="button" onClick={onGotIt} className="h-16 w-full bg-flame-3 text-2xl font-bold text-ember active:brightness-90">
          Got it
        </button>
      ) : isVoid ? null : cooking ? (
        <button type="button" onClick={() => onAdvance('READY')} className="h-16 w-full bg-mint text-2xl font-bold text-ember active:brightness-90">
          Ready
        </button>
      ) : (
        <button type="button" onClick={() => onAdvance('PREPARING')} className="h-16 w-full bg-surface-3 text-2xl font-bold text-ink ring-1 ring-hairline-strong ring-inset active:brightness-90">
          Start
        </button>
      )}
    </li>
  );
}
