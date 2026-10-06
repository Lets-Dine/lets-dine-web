import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FONEPAY_ENABLED, getFonepay, saveFonepay, setFonepayEnabled } from '../../api/fonepay';
import type { FonepaySummary } from '../../api/fonepay';
import { ADMIN_GHOST, ADMIN_PRIMARY, ADMIN_TINY, Field, PageTitle, Panel, TextInput, useCommand } from '../../components/admin/kit';
import { Cash, Check, Qr, X } from '../../components/icons';
import { cx } from '../../components/ui';
import { useAuth } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';

/**
 * How this restaurant takes payment. Cash and card are recorded by staff at the till and need no
 * setup; Fonepay QR is the one mode that needs the restaurant's own merchant account, so that is
 * where money from a scanned QR settles. The merchant credentials are kept encrypted server-side and
 * are never sent back here — which is why the two secret fields are always blank when the dialog opens.
 */
export function PaymentModes() {
  const { allows } = useAuth();
  const canEdit = allows('settings:edit');
  const fonepay = useAsync(async () => (FONEPAY_ENABLED ? getFonepay() : null), []);
  const summary = fonepay.data;
  const [open, setOpen] = useState(false);
  const { busy, run } = useCommand();
  const on = !!summary?.configured && summary.enabled;
  const toggle = () =>
    void run('fonepay-toggle', () => setFonepayEnabled(!on), on ? 'Fonepay switched off' : 'Fonepay switched on').then((ok) => ok && fonepay.reload());

  return (
    <>
      <PageTitle title="Payment modes" subtitle="How your guests can pay the bill" />

      <div className="max-w-3xl">
        <Panel bare>
          <ul className="divide-y divide-hairline">
            <ModeRow icon={<Cash size={18} />} name="Cash" detail="Staff record it at the till. Nothing to set up." status="On" tone="on" />
            <ModeRow icon={<Cash size={18} />} name="Card" detail="Staff record the card machine's receipt. Nothing to set up." status="On" tone="on" />
            <ModeRow
              icon={<Qr size={18} />}
              name="Fonepay QR"
              detail="Guests scan a QR for the exact bill amount; it pays into your own Fonepay merchant account."
              status={!FONEPAY_ENABLED ? 'Unavailable in demo' : fonepay.loading && !summary ? 'Checking…' : fonepay.error ? 'Couldn’t load' : summary?.configured ? (summary.enabled ? 'On' : 'Off') : 'Not set up'}
              tone={on ? 'on' : 'off'}
              action={
                FONEPAY_ENABLED && canEdit ? (
                  <>
                    {summary?.configured && (
                      <button type="button" className={ADMIN_GHOST} disabled={busy} onClick={toggle}>
                        {on ? 'Turn off' : 'Turn on'}
                      </button>
                    )}
                    <button type="button" className={ADMIN_GHOST} onClick={() => setOpen(true)}>
                      {summary?.configured ? 'Edit' : 'Set up'}
                    </button>
                  </>
                ) : undefined
              }
            />
          </ul>
        </Panel>
      </div>

      {open && (
        <FonepayDialog
          summary={summary ?? null}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            fonepay.reload();
          }}
        />
      )}
    </>
  );
}

function FonepayDialog({ summary, onClose, onSaved }: { summary: FonepaySummary | null; onClose: () => void; onSaved: () => void }) {
  const { busy, run } = useCommand();
  const [merchantCode, setMerchantCode] = useState(summary?.merchantCode ?? '');
  const [username, setUsername] = useState(summary?.username ?? '');
  const [secretKey, setSecretKey] = useState('');
  const [password, setPassword] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    bodyRef.current?.querySelector('input')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const configured = !!summary?.configured;
  const ready = merchantCode.trim() && username.trim() && secretKey && password;

  const submit = async () => {
    const ok = await run(
      'fonepay',
      () => saveFonepay({ merchantCode: merchantCode.trim(), username: username.trim(), secretKey, password }),
      'Fonepay saved',
    );
    if (ok) onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="presentation" onClick={onClose}>
      <form
        className="animate-pop max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-surface p-5 text-ink shadow-deep ring-1 ring-hairline ring-inset sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fonepay-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !busy) void submit();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="fonepay-title" className="font-display text-[22px] leading-tight font-black">
              Fonepay merchant account
            </h2>
            <p className="mt-1 text-[13px] text-ink-3">Use the details Fonepay gave your business. QR payments settle into this account.</p>
          </div>
          <button type="button" aria-label="Close" className={`${ADMIN_TINY} text-ink-3 hover:text-ink`} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div ref={bodyRef} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Merchant code">
            <TextInput value={merchantCode} onChange={setMerchantCode} maxLength={60} />
          </Field>
          <Field label="Username">
            <TextInput value={username} onChange={setUsername} maxLength={60} />
          </Field>
          <Field label="Secret key" hint={configured ? 'Saved, and hidden. Enter it again to save changes.' : undefined}>
            <TextInput type="password" value={secretKey} onChange={setSecretKey} maxLength={200} placeholder={configured ? '••••••••' : undefined} />
          </Field>
          <Field label="Password" hint={configured ? 'Saved, and hidden. Enter it again to save changes.' : undefined}>
            <TextInput type="password" value={password} onChange={setPassword} maxLength={200} placeholder={configured ? '••••••••' : undefined} />
          </Field>
        </div>

        <p className="mt-4 text-[12.5px] text-ink-4">Stored encrypted. Not shown again after saving.</p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" className={ADMIN_GHOST} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={ADMIN_PRIMARY} disabled={busy || !ready}>
            {busy ? 'Saving…' : configured ? 'Update Fonepay' : 'Connect Fonepay'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ModeRow({
  icon,
  name,
  detail,
  status,
  tone,
  action,
}: {
  icon: ReactNode;
  name: string;
  detail: string;
  status: string;
  tone: 'on' | 'off';
  action?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3.5 px-4 py-3.5 sm:px-5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold">{name}</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{detail}</p>
      </div>
      <span className={cx('inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold', tone === 'on' ? 'text-ink' : 'text-ink-4')}>
        {tone === 'on' && <Check size={14} />}
        {status}
      </span>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </li>
  );
}
