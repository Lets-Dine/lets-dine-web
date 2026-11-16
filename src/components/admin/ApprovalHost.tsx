import { useEffect, useRef, useState } from 'react';
import { registerApprovalAsker } from '../../api/approval';
import type { ApprovalAsk, ApprovalGrant } from '../../api/approval';
import { fetchPaymentApprovers } from '../../api/staff';
import { formatMoney } from '../../domain/money';
import { ROLE_LABEL } from '../../domain/permissions';
import { useToast } from '../../state/ToastContext';
import { useAsync } from '../../state/useAsync';
import { BTN_FLAME, BTN_GHOST, DISPLAY, cx } from '../ui';
import { Avatar } from './Avatar';
import { Loading, TextInput } from './kit';

const WHAT: Record<string, string> = { discount: 'a discount', lines: 'a change to what was ordered', customer: 'points or credit on a customer the order was not placed under' };

/**
 * Where a payment that needs a manager lands. Mounted once for the whole dashboard: the command runner asks for approval
 * when the server says it is needed, this puts the question on screen, and the answer goes back as the retry's PIN.
 */
export function ApprovalHost() {
  const push = useToast();
  const [asking, setAsking] = useState<{ ask: ApprovalAsk; settle: (grant: ApprovalGrant | null) => void } | null>(null);
  /** The open question's way out, so it can be answered "no" if this host goes away while it is on screen. */
  const settleOpen = useRef<((grant: ApprovalGrant | null) => void) | null>(null);

  useEffect(() => {
    const unregister = registerApprovalAsker(
      (ask) =>
        new Promise((resolve) => {
          // One question at a time: a second payment asking while one is open is turned away, and told so.
          if (settleOpen.current) {
            push('Finish the open manager approval first', '⚠️');
            return resolve(null);
          }
          const settle = (grant: ApprovalGrant | null) => {
            settleOpen.current = null;
            setAsking(null);
            resolve(grant);
          };
          settleOpen.current = settle;
          setAsking({ ask, settle });
        }),
    );
    return () => {
      unregister();
      // Leaving the screen mid-question must not leave the payment waiting on it forever.
      settleOpen.current?.(null);
    };
  }, [push]);

  return asking ? <ApprovalDialog ask={asking.ask} onDone={asking.settle} /> : null;
}

function ApprovalDialog({ ask, onDone }: { ask: ApprovalAsk; onDone: (grant: ApprovalGrant | null) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const approvers = useAsync(fetchPaymentApprovers, []);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [pin, setPin] = useState('');

  // A native modal, so it stands above the payment sheet it was opened from.
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  const list = approvers.data ?? [];
  const chosen = memberId ?? (list.length === 1 ? list[0].memberId : null);
  const what = ask.reasons.map((r) => WHAT[r] ?? 'a change').join(' and ') || 'a change to this bill';
  const ready = chosen !== null && /^\d{4,8}$/.test(pin);
  const d = ask.details ?? {};

  return (
    <dialog
      ref={ref}
      aria-label="Manager approval"
      onCancel={(e) => {
        e.preventDefault();
        onDone(null);
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none items-center justify-center border-0 bg-black/60 p-4 text-ink outline-none backdrop:bg-transparent open:flex"
    >
      <form
        className="animate-pop w-full max-w-sm rounded-3xl bg-surface p-6 shadow-deep ring-1 ring-hairline ring-inset"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onDone({ memberId: chosen, pin });
        }}
      >
        <h2 className={cx(DISPLAY, 'text-[24px]')}>Manager approval</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-3">This bill has {what}. A manager or owner needs to approve it with their approval PIN.</p>
        {(d.discount ?? 0) > 0 || (d.ordered !== undefined && d.charged !== undefined && ask.reasons.includes('lines')) ? (
          <dl className="mt-3 grid gap-1.5 rounded-2xl bg-surface-2 px-4 py-3 text-[14px] ring-1 ring-hairline ring-inset">
            {(d.discount ?? 0) > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-3">Discount</dt>
                <dd className="font-semibold tnum">{formatMoney(d.discount!, d.currency ?? '')}</dd>
              </div>
            )}
            {d.ordered !== undefined && d.charged !== undefined && ask.reasons.includes('lines') && (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-3">Items charged</dt>
                <dd className="font-semibold tnum">
                  {d.charged} of {d.ordered} ordered
                </dd>
              </div>
            )}
          </dl>
        ) : null}
        {ask.note && (
          <p role="alert" className="mt-3 rounded-xl bg-berry/10 px-3.5 py-2.5 text-[13.5px] text-berry ring-1 ring-berry/25 ring-inset">
            {ask.note}
          </p>
        )}

        <div className="mt-4">
          {!approvers.data ? (
            approvers.error ? <p className="text-[13.5px] text-berry">{approvers.error.message}</p> : <Loading />
          ) : list.length === 0 ? (
            <p className="text-[14px] text-ink-3">Nobody at this branch can approve this yet. A manager or owner has to set an approval PIN on their own profile first.</p>
          ) : (
            <ul role="radiogroup" aria-label="Who is approving" className="grid gap-2">
              {list.map((a) => (
                <li key={a.memberId}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={chosen === a.memberId}
                    onClick={() => setMemberId(a.memberId)}
                    className={cx(
                      'flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left ring-1 ring-inset transition-colors',
                      chosen === a.memberId ? 'bg-flame/10 ring-flame/60' : 'bg-surface-2 ring-hairline hover:bg-surface-3',
                    )}
                  >
                    <Avatar name={a.name} src={a.avatarUrl} className="size-10 text-[16px]" />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold">{a.name}</span>
                      <span className="block text-[12.5px] text-ink-3">{ROLE_LABEL[a.role]}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {list.length > 0 && (
          <label className="mt-4 block">
            <span className="text-[12px] font-semibold tracking-[0.08em] text-ink-4 uppercase">Their approval PIN</span>
            <span className="mt-1.5 block">
              <TextInput value={pin} onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 8))} type="password" inputMode="numeric" maxLength={8} autoComplete="one-time-code" autoFocus={chosen !== null} className="tnum" />
            </span>
          </label>
        )}

        <div className="mt-5 grid gap-2.5">
          <button type="submit" disabled={!ready} className={cx(BTN_FLAME, 'h-13 w-full')}>
            Approve
          </button>
          <button type="button" className={cx(BTN_GHOST, 'h-13 w-full')} onClick={() => onDone(null)}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
