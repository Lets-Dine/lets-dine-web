import { useCallback, useEffect, useState } from 'react';
import { IS_LIVE_API } from '../../api/http';
import { dismissTicketWarning, listUnacknowledged, subscribeToTicketChanges, subscribeToTicketReady } from '../../api/kitchen';
import type { KitchenTicket } from '../../api/kitchen';
import { playNewOrderSound } from '../../platform/sound';
import { useToast } from '../../state/ToastContext';
import { Alert } from '../icons';
import { ADMIN_GHOST } from './kit';

/** How long a station with a device may leave a ticket unacknowledged before the front of house is told. */
const WARN_AFTER_MS = 60_000;

const STATION_LABEL = { KITCHEN: 'Kitchen', BAR: 'Bar' } as const;

function where(ticket: KitchenTicket): string {
  const order = ticket.order;
  if (!order) return `#${ticket.number}`;
  const place = order.orderType === 'DELIVERY' ? 'Delivery' : (order.tableName ?? order.floorName ?? 'Dine-in');
  return `#${ticket.number} (${place})`;
}

/**
 * The safety net for a kitchen on another floor: a ticket went out and nobody there has tapped
 * "Got it". Without this a dead tablet or dropped internet loses orders silently. Only stations the
 * branch marked as having a screen or printer are listed (the server filters), so it stays quiet
 * for a branch that has neither. Nothing renders while every ticket has been seen in time.
 */
export function KitchenWatch() {
  const toast = useToast();
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const reload = useCallback(() => {
    listUnacknowledged()
      .then(setTickets)
      .catch(() => {
        /* the next ticket event or refocus reads it again */
      });
  }, []);

  useEffect(() => {
    if (!IS_LIVE_API) return;
    reload();
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    const leave = subscribeToTicketChanges(reload);
    // The kitchen finished something — a waiter on any admin page hears it and knows where to go.
    const leaveReady = subscribeToTicketReady((ticket) => {
      toast(`${ticket.order ? where(ticket) : `#${ticket.number}`} — ${STATION_LABEL[ticket.station]} order ready to serve`);
      playNewOrderSound();
    });
    const tick = setInterval(() => setNow(Date.now()), 10_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      leave();
      leaveReady();
      clearInterval(tick);
    };
  }, [reload, toast]);

  // Optimistic: the warning goes the moment it is dismissed; a failure brings it back on the next read.
  const dismiss = (rows: KitchenTicket[]) => {
    const ids = new Set(rows.map((t) => t.id));
    setTickets((list) => list.filter((t) => !ids.has(t.id)));
    Promise.all(rows.map((t) => dismissTicketWarning(t.id))).catch(reload);
  };

  const overdue = tickets.filter((t) => now - new Date(t.createdAt).getTime() >= WARN_AFTER_MS);
  if (overdue.length === 0) return null;

  // Two different problems with two different fixes: nobody at a screen, or a slip that never came out.
  const unseen = overdue.filter((t) => t.unconfirmed !== 'printer');
  const unprinted = overdue.filter((t) => t.unconfirmed === 'printer');
  const list = (rows: KitchenTicket[]) => rows.map((t) => `${STATION_LABEL[t.station]} ${where(t)}`).join(' · ');

  return (
    <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl bg-berry/10 px-4 py-3 ring-1 ring-berry/30 ring-inset">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-berry text-white" aria-hidden>
        <Alert size={16} />
      </span>
      <div className="grid min-w-0 flex-1 gap-2 text-[14px] leading-snug">
        {unseen.length > 0 && (
          <div>
            <p className="font-semibold text-ink">
              {unseen.length === 1 ? "The kitchen hasn't confirmed an order" : `${unseen.length} orders the kitchen hasn't confirmed`}
            </p>
            <p className="text-ink-3">{list(unseen)} — check their screen or call them.</p>
            <button type="button" className={`${ADMIN_GHOST} mt-2`} onClick={() => dismiss(unseen)}>
              I've told them
            </button>
          </div>
        )}
        {unprinted.length > 0 && (
          <div>
            <p className="font-semibold text-ink">{unprinted.length === 1 ? "A slip hasn't printed" : `${unprinted.length} slips haven't printed`}</p>
            <p className="text-ink-3">
              {list(unprinted)} — check the printer is on, and that a PC with QZ Tray running has “Use this PC to print” switched on (Settings → Printing).
            </p>
            <button type="button" className={`${ADMIN_GHOST} mt-2`} onClick={() => dismiss(unprinted)}>
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
