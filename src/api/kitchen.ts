import type { KitchenStation } from '../domain/types';
import { apiRequest } from './http';
import { authHeaders, readToken } from './live-admin';
import { getSocket, joinRoom } from './socket';

/**
 * The kitchen and bar screens' feed. Live API only — a mock build has no
 * tickets to show, so `/kitchen` tells the person that instead of faking it.
 */

export interface KitchenTicketLine {
  id: string;
  /** Positive = make this many; negative = a void, stop making them. */
  qtyDelta: number;
  dishNameSnapshot: string;
  variantNameSnapshot: string | null;
  addOnNames: string[];
  notes: string;
  /** Where the order line behind it stands now; null once removed. */
  itemStatus?: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED' | null;
}

export interface KitchenTicket {
  id: string;
  station: KitchenStation;
  /** The number the pass calls it by. */
  number: number;
  createdAt: string;
  acknowledgedAt: string | null;
  printedAt?: string | null;
  /** On the not-confirmed list only: waiting on a person at a screen, or on a printer. */
  unconfirmed?: 'screen' | 'printer';
  lines: KitchenTicketLine[];
  order?: {
    reference: string;
    orderType: 'DINE_IN' | 'DELIVERY';
    tableName: string | null;
    floorName: string | null;
    floorVisitorName: string | null;
  };
}

export function listTickets(station: KitchenStation): Promise<KitchenTicket[]> {
  return apiRequest<KitchenTicket[]>(`/restaurant/kitchen-tickets?station=${station}`, { headers: authHeaders() });
}

export function acknowledgeTicket(id: string): Promise<KitchenTicket> {
  return apiRequest<KitchenTicket>(`/restaurant/kitchen-tickets/${encodeURIComponent(id)}/acknowledge`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

/** "Start" (PREPARING) or "Ready" from the kitchen's own screen. Also counts as having seen it. */
export function advanceTicket(id: string, status: 'PREPARING' | 'READY'): Promise<KitchenTicket> {
  return apiRequest<KitchenTicket>(`/restaurant/kitchen-tickets/${encodeURIComponent(id)}/advance`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });
}

/**
 * `onResync` fires on every (re)join, including the first, so the caller refetches
 * once over HTTP and catches whatever landed while the tablet was offline.
 * `onConnection` reports the socket going up or down so the screen can say so.
 */
export function subscribeToStation(
  station: KitchenStation,
  handlers: {
    onCreated: (ticket: KitchenTicket) => void;
    onUpdated: (ticket: KitchenTicket) => void;
    onResync: () => void;
    onConnection: (online: boolean) => void;
  },
): () => void {
  const token = readToken();
  if (!token) return () => {};

  const socket = getSocket();
  const up = () => handlers.onConnection(true);
  const down = () => handlers.onConnection(false);
  socket.on('kitchen.ticket.created', handlers.onCreated);
  socket.on('kitchen.ticket.updated', handlers.onUpdated);
  socket.on('connect', up);
  socket.on('disconnect', down);
  handlers.onConnection(socket.connected);

  const leaveRoom = joinRoom('subscribe:station', { token, station }, handlers.onResync);

  return () => {
    socket.off('kitchen.ticket.created', handlers.onCreated);
    socket.off('kitchen.ticket.updated', handlers.onUpdated);
    socket.off('connect', up);
    socket.off('disconnect', down);
    leaveRoom();
  };
}

/** The front of house stops being warned about one ticket — it doesn't mark it seen by the station. */
export function dismissTicketWarning(id: string): Promise<null> {
  return apiRequest<null>(`/restaurant/kitchen-tickets/${encodeURIComponent(id)}/dismiss-warning`, { method: 'POST', headers: authHeaders() });
}

/** Tickets a station with a device hasn't acknowledged yet — the server already leaves out stations without one. */
export function listUnacknowledged(): Promise<KitchenTicket[]> {
  return apiRequest<KitchenTicket[]>('/restaurant/kitchen-tickets/unacknowledged', { headers: authHeaders() });
}

/**
 * Rides the pass's own room (`subscribe:queue`, joined by the dashboard), so it needs no join of
 * its own — only the listeners. Any ticket event, or a (re)join of that room, means "read the list again".
 */
export function subscribeToTicketChanges(onChange: () => void): () => void {
  const socket = getSocket();
  const handleOk = (ack: { scope?: string }) => ack?.scope === 'queue' && onChange();
  socket.on('kitchen.ticket.created', onChange);
  socket.on('kitchen.ticket.updated', onChange);
  socket.on('subscribe:ok', handleOk);
  return () => {
    socket.off('kitchen.ticket.created', onChange);
    socket.off('kitchen.ticket.updated', onChange);
    socket.off('subscribe:ok', handleOk);
  };
}

/** A station finished a ticket — the floor should come and get it. Rides the pass's room, like the warning above. */
export function subscribeToTicketReady(onReady: (ticket: KitchenTicket) => void): () => void {
  const socket = getSocket();
  socket.on('kitchen.ticket.ready', onReady);
  return () => {
    socket.off('kitchen.ticket.ready', onReady);
  };
}
