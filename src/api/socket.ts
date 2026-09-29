import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { API_BASE_URL } from './http';

/**
 * One socket for the whole tab, shared by the diner's order-status screen and
 * the restaurant's pass — `live.ts` and `live-admin.ts` each subscribe their
 * own rooms on it rather than opening a connection per screen.
 *
 * Only ever called from those two files, both of which already check
 * `IS_LIVE_API` before touching this module — nothing here runs in mock mode.
 */

let socket: Socket | null = null;

/** The Socket.IO server listens on the same host as the API, on its own path — not behind the `/api/v1` prefix. */
function socketOrigin(): string {
  return API_BASE_URL.replace(/\/api\/v\d+\/?$/, '');
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(socketOrigin(), { transports: ['websocket', 'polling'] });
    // Socket.IO auto-reconnects on its own for a dropped connection, a timed-out
    // ping, or a transport error — but not when the *server* is the one that
    // disconnected the client (`io server disconnect`), which is deliberately
    // left manual so a server-side kick (e.g. revoking a session) sticks. That
    // is never what we want here, so force the reconnect ourselves.
    socket.on('disconnect', (reason) => {
      console.log('socket disconnect', reason);
      if (reason === 'io server disconnect') socket?.connect();
    });
  }
  return socket;
}

/** How long to wait before retrying a subscribe the server rejected (a session mid-resolve, a DB hiccup right after a reconnect storm). */
const SUBSCRIBE_RETRY_MS = 2000;

/**
 * Joins a room and keeps rejoining it across reconnects (a dropped wifi
 * connection must not silently stop delivering order updates). `onResync`
 * fires after every successful (re)subscribe, including the first, so the
 * caller can refetch once via HTTP and catch anything missed while offline.
 *
 * `event` doubles as this room's scope (`subscribe:order` -> `order`, matching
 * the `scope` every gateway ack carries) so this join's own ok/error is what
 * drives it, not another room's ack landing on the same shared socket.
 */
export function joinRoom(event: string, payload: unknown, onResync: () => void): () => void {
  const client = getSocket();
  const scope = event.replace(/^subscribe:/, '');
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const clearRetry = () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const join = () => {
    clearRetry();
    client.emit(event, payload);
  };

  client.on('connect', join);
  if (client.connected) join();

  // ponytail: matched by scope only, not a per-instance id — two simultaneous
  // rooms of the same scope (e.g. two open orders) can redundantly resync
  // each other. Harmless (onResync is just an idempotent HTTP refetch); add
  // an id round-trip through the gateway acks if that starts to matter.
  const handleOk = (ack: { scope?: string }) => {
    if (ack?.scope !== scope) return;
    clearRetry();
    onResync();
  };
  const handleError = (error: { scope?: string; message?: string }) => {
    if (error?.scope !== scope) return;
    console.warn(`[socket] ${event} failed`, error);
    clearRetry();
    retryTimer = setTimeout(join, SUBSCRIBE_RETRY_MS);
  };
  client.on('subscribe:ok', handleOk);
  client.on('subscribe:error', handleError);

  return () => {
    clearRetry();
    client.off('connect', join);
    client.off('subscribe:ok', handleOk);
    client.off('subscribe:error', handleError);
  };
}
