import { useCallback, useEffect, useState } from 'react';
import { clearServiceRequest, listServiceRequests, subscribeToServiceRequests } from '../../api/staff';
import type { ServiceKind, ServiceRequest } from '../../domain/types';
import { playNewOrderSound } from '../../platform/sound';
import { useToast } from '../../state/ToastContext';
import { Bell, Receipt } from '../icons';
import { relativeTime } from '../time';

/**
 * Diners at a table asking for a waiter or the bill. Rides the pass's socket room for instant updates; the
 * list is also re-read on mount and whenever the tab comes back to the foreground, which covers anything
 * missed while offline. Nothing renders while nobody is asking.
 */
export function ServiceRequests() {
  const toast = useToast();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);

  const reload = useCallback(() => {
    listServiceRequests()
      .then(setRequests)
      .catch(() => {
        /* the next event or refocus re-reads it */
      });
  }, []);

  useEffect(() => {
    reload();
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    const leave = subscribeToServiceRequests((next) => {
      setRequests((prev) => {
        const old = prev.find((r) => r.sessionId === next.sessionId);
        // Sound only for a genuinely newer ask — clearing one of two must not ring again.
        if ((next.waiterCalledAt ?? '') > (old?.waiterCalledAt ?? '') || (next.billRequestedAt ?? '') > (old?.billRequestedAt ?? '')) {
          playNewOrderSound();
        }
        const rest = prev.filter((r) => r.sessionId !== next.sessionId);
        return next.waiterCalledAt || next.billRequestedAt ? [...rest, next] : rest;
      });
    }, reload);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      leave();
    };
  }, [reload]);

  const clear = (sessionId: string, kind: ServiceKind) => {
    clearServiceRequest(sessionId, kind)
      .then((next) =>
        setRequests((prev) => {
          const rest = prev.filter((r) => r.sessionId !== sessionId);
          return next.waiterCalledAt || next.billRequestedAt ? [...rest, next] : rest;
        }),
      )
      .catch((e: Error) => {
      toast(e.message);
      reload();
    });
  };

  if (requests.length === 0) return null;

  return (
    <ul className="mb-5 flex flex-col gap-2" aria-label="Diners asking for service">
      {requests.flatMap((r) =>
        (['waiter', 'bill'] as const)
          .filter((kind) => (kind === 'waiter' ? r.waiterCalledAt : r.billRequestedAt))
          .map((kind) => (
            <li
              key={`${r.sessionId}:${kind}`}
              className="flex items-center gap-3 rounded-2xl bg-flame/10 px-4 py-3 ring-1 ring-flame/30 ring-inset"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-flame text-white" aria-hidden>
                {kind === 'waiter' ? <Bell size={16} /> : <Receipt size={16} />}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <b className="block truncate text-[15px] font-bold">
                  {r.label} {kind === 'waiter' ? 'is calling a waiter' : 'wants the bill'}
                </b>
                <span className="text-[12.5px] text-ink-3">{relativeTime((kind === 'waiter' ? r.waiterCalledAt : r.billRequestedAt) as string)}</span>
              </span>
              <button
                type="button"
                onClick={() => clear(r.sessionId, kind)}
                className="h-9 shrink-0 rounded-full bg-flame px-4 text-[13.5px] font-bold text-white transition-move active:scale-95"
              >
                {kind === 'waiter' ? 'On my way' : 'Bill brought'}
              </button>
            </li>
          )),
      )}
    </ul>
  );
}
