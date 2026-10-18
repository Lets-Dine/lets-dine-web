import { useState } from 'react';
import { requestService } from '../api/diner';
import { IS_LIVE_API } from '../api/http';
import type { DiningSession, ServiceKind } from '../domain/types';
import { haptic } from '../platform/haptics';
import { useToast } from '../state/ToastContext';
import { Bell, Receipt } from './icons';
import { cx } from './ui';

const OPTIONS: { kind: ServiceKind; label: string; icon: typeof Bell; sent: string }[] = [
  { kind: 'waiter', label: 'Call waiter', icon: Bell, sent: 'Waiter is on the way' },
  { kind: 'bill', label: 'Ask for the bill', icon: Receipt, sent: 'Bill requested' },
];

/**
 * Two taps a seated diner can make without flagging anyone down. Table visits only (delivery and floor have
 * nobody to walk over to), and live only — the offline demo has no staff on the other end. The confirmation is
 * local: asking again is harmless, so there is nothing to lock beyond the in-flight request.
 */
export function CallStaff({ session }: { session: DiningSession }) {
  const toast = useToast();
  const [busy, setBusy] = useState<ServiceKind | null>(null);
  const [sent, setSent] = useState<Set<ServiceKind>>(new Set());

  if (!IS_LIVE_API || session.endedAt || !session.tableId) return null;

  const ask = async (kind: ServiceKind, doneLabel: string) => {
    haptic.tick();
    setBusy(kind);
    try {
      await requestService(session, kind);
      setSent((prev) => new Set(prev).add(kind));
      toast(doneLabel);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not reach staff — try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map(({ kind, label, icon: Icon, sent: doneLabel }) => (
        <button
          key={kind}
          type="button"
          disabled={busy !== null}
          onClick={() => void ask(kind, doneLabel)}
          className={cx(
            'inline-flex h-11 items-center gap-2 rounded-full px-4 text-[14px] font-semibold ring-1 ring-inset transition-move active:scale-95 disabled:opacity-60',
            sent.has(kind) ? 'bg-mint/10 text-mint ring-mint/30' : 'bg-surface-2 text-ink ring-hairline',
          )}
        >
          <Icon size={16} />
          {sent.has(kind) ? doneLabel : label}
        </button>
      ))}
    </div>
  );
}
