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
      if (reason === 'io server disconnect') socket?.connect();
    });
  }
  return socket;
}

/**
 * Joins a room and keeps rejoining it across reconnects (a dropped wifi
 * connection must not silently stop delivering order updates). `onResync`
 * fires after every successful (re)subscribe, including the first, so the
 * caller can refetch once via HTTP and catch anything missed while offline.
 */
export function joinRoom(event: string, payload: unknown, onResync: () => void): () => void {
  const client = getSocket();
  const join = () => client.emit(event, payload);

  client.on('connect', join);
  if (client.connected) join();

  const handleOk = () => onResync();
  const handleError = (error: unknown) => console.warn(`[socket] ${event} failed`, error);
  client.on('subscribe:ok', handleOk);
  client.on('subscribe:error', handleError);

  return () => {
    client.off('connect', join);
    client.off('subscribe:ok', handleOk);
    client.off('subscribe:error', handleError);
  };
}
