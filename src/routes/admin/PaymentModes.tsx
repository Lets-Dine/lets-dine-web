import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FONEPAY_ENABLED, getFonepay, saveFonepay, setFonepayEnabled } from '../../api/fonepay';
import type { FonepaySummary } from '../../api/fonepay';
import { STATIC_QR_ENABLED, getStaticQr, saveStaticQr, setStaticQrEnabled } from '../../api/staticQr';
import type { StaticQr } from '../../api/staticQr';
import { uploadToCloudinary } from '../../api/cloudinary';
import { imageForUpload, readQr } from '../../domain/readQr';
import { ADMIN_GHOST, ADMIN_PRIMARY, ADMIN_TINY, Field, PageTitle, Panel, TextInput, useCommand } from '../../components/admin/kit';
import { Alert, Cash, Check, Qr, X } from '../../components/icons';
import { cx } from '../../components/ui';
import { useAuth } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';

/**
 * How this restaurant takes payment. Cash and card are recorded by staff at the till and need no
 * setup; Fonepay QR is the one mode that needs the restaurant's own merchant account, so that is
 * where money from a scanned QR settles. A static QR is a picture the restaurant already has (a bank
 * or wallet sticker): it is shown to the customer at payment, unchanged. The merchant credentials are
 * kept encrypted server-side and are never sent back here, which is why the two secret fields are
 * always blank when the dialog opens.
 */
export function PaymentModes() {
  const { allows } = useAuth();
  const canEdit = allows('settings:edit');
  const fonepay = useAsync(async () => (FONEPAY_ENABLED ? getFonepay() : null), []);
  const staticQr = useAsync(async () => (STATIC_QR_ENABLED ? getStaticQr() : null), []);
  const summary = fonepay.data;
  const qr = staticQr.data;
  const [open, setOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const { busy, run } = useCommand();
  const on = !!summary?.configured && summary.enabled;
  const qrOn = !!qr?.imageUrl && qr.enabled;
  const toggle = () =>
    void run('fonepay-toggle', () => setFonepayEnabled(!on), on ? 'Fonepay switched off' : 'Fonepay switched on').then((ok) => ok && fonepay.reload());
  const toggleQr = () =>
    void run('static-qr-toggle', () => setStaticQrEnabled(!qrOn), qrOn ? 'Static QR switched off' : 'Static QR switched on').then((ok) => ok && staticQr.reload());

  return (
    <>
      <div className="animate-rise">
        <PageTitle title="Payment modes" subtitle="How your guests can pay the bill" />
      </div>

      <div className="animate-rise [animation-delay:120ms]">
        <Panel bare>
          <ul className="divide-y divide-hairline">
            <ModeRow icon={<Cash size={18} />} name="Cash" detail="Staff record it at the till. Nothing to set up." status="On" tone="on" delay={200} />
            <ModeRow icon={<Cash size={18} />} name="Card" detail="Staff record the card machine's receipt. Nothing to set up." status="On" tone="on" delay={245} />
            <ModeRow
              icon={<Qr size={18} />}
              name="Static QR"
              detail="Your own QR picture. The customer scans it when they pay, and staff mark the bill paid."
              status={!STATIC_QR_ENABLED ? 'Unavailable in demo' : staticQr.loading && !qr ? 'Checking…' : staticQr.error ? "Couldn't load" : qr?.imageUrl ? (qr.enabled ? 'On' : 'Off') : 'Not set up'}
              tone={qrOn ? 'on' : 'off'}
              delay={270}
              action={
                STATIC_QR_ENABLED && canEdit ? (
                  <>
                    {qr?.imageUrl && (
                      <button type="button" className={ADMIN_GHOST} disabled={busy} onClick={toggleQr}>
                        {qrOn ? 'Turn off' : 'Turn on'}
                      </button>
                    )}
                    <button type="button" className={ADMIN_GHOST} onClick={() => setQrOpen(true)}>
                      {qr?.imageUrl ? 'Edit' : 'Set up'}
                    </button>
                  </>
                ) : undefined
              }
            />
            <ModeRow
              icon={<Qr size={18} />}
              name="Fonepay QR"
              detail="Guests scan a QR for the exact bill amount; it pays into your own Fonepay merchant account."
              status={!FONEPAY_ENABLED ? 'Unavailable in demo' : fonepay.loading && !summary ? 'Checking…' : fonepay.error ? "Couldn't load" : summary?.configured ? (summary.enabled ? 'On' : 'Off') : 'Not set up'}
              tone={on ? 'on' : 'off'}
              delay={290}
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

      {qrOpen && (
        <StaticQrDialog
          current={qr ?? null}
          onClose={() => setQrOpen(false)}
          onSaved={() => {
            setQrOpen(false);
            staticQr.reload();
          }}
        />
      )}

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

const QR_BYTES = 8 * 1024 * 1024;

type Picked =
  | { state: 'checking'; file: File; preview: string }
  | { state: 'invalid'; file: File; preview: string; reason: string }
  | { state: 'ready'; file: File; preview: string; text: string };

const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,.svg';

function accepted(file: File): boolean {
  return file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg') || ACCEPT.split(',').includes(file.type);
}

/** Enough of the code's contents to tell a payment QR from a menu link, without printing a long payload. */
function describeCode(text: string): string {
  try {
    const url = new URL(text);
    if (url.protocol === 'http:' || url.protocol === 'https:') return `A link to ${url.host}`;
  } catch {
    /* not a URL */
  }
  return text.length > 36 ? `${text.slice(0, 36)}…` : text;
}

function StaticQrDialog({ current, onClose, onSaved }: { current: StaticQr | null; onClose: () => void; onSaved: () => void }) {
  const { busy, run } = useCommand();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [dragging, setDragging] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const preview = picked?.preview;
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const choose = async (file: File | undefined) => {
    if (!file || busy) return;
    const url = URL.createObjectURL(file);
    if (!accepted(file)) return setPicked({ state: 'invalid', file, preview: url, reason: 'Use a PNG, JPEG, WebP or SVG picture.' });
    if (file.size > QR_BYTES) return setPicked({ state: 'invalid', file, preview: url, reason: 'This picture is over 8 MB. Use a smaller one.' });
    setPicked({ state: 'checking', file, preview: url });
    const text = await readQr(file).catch(() => null);
    setPicked((p) =>
      p?.file !== file
        ? p
        : text
          ? { state: 'ready', file, preview: url, text }
          : { state: 'invalid', file, preview: url, reason: 'No QR code could be read. Crop close to the code and make sure it is sharp.' },
    );
  };

  const save = async () => {
    if (picked?.state !== 'ready') return;
    const ok = await run('static-qr', async () => saveStaticQr(await uploadToCloudinary(await imageForUpload(picked.file), 'payment-qr')), 'Payment QR saved');
    if (ok) onSaved();
  };

  const shown = picked?.preview ?? current?.imageUrl ?? null;
  const tone = picked?.state === 'ready' ? 'ring-mint/60' : picked?.state === 'invalid' ? 'ring-berry/60' : dragging ? 'ring-flame-2/60' : 'ring-hairline-strong';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="presentation" onClick={onClose}>
      <div
        className="animate-pop w-full max-w-md rounded-3xl bg-surface p-5 text-ink shadow-deep ring-1 ring-hairline ring-inset sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="static-qr-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="static-qr-title" className="font-display text-[22px] leading-tight font-black">
              Static QR
            </h2>
            <p className="mt-1 text-[13px] text-ink-3">The QR your bank or wallet gave you. Customers see it exactly as you upload it.</p>
          </div>
          <button type="button" aria-label="Close" className={`${ADMIN_TINY} text-ink-3 hover:text-ink`} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <input
          id="static-qr-file"
          type="file"
          accept={ACCEPT}
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            void choose(file);
          }}
        />
        <label
          htmlFor="static-qr-file"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void choose(e.dataTransfer.files[0]);
          }}
          className={cx(
            'mt-5 flex cursor-pointer flex-col items-center gap-3 rounded-2xl bg-surface-2 p-5 text-center ring-2 ring-inset transition-[box-shadow,background-color] duration-200 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-flame-2',
            tone,
            dragging && 'bg-surface-3',
            busy && 'pointer-events-none opacity-60',
          )}
        >
          {shown ? (
            <span className="relative block size-48 overflow-hidden rounded-xl bg-white p-3">
              <img src={shown} alt={picked ? 'Chosen picture' : 'Current payment QR'} className="size-full object-contain" />
              {picked?.state === 'checking' && <span aria-hidden className="absolute inset-0 shimmer-bg opacity-60" />}
            </span>
          ) : (
            <span className="grid size-14 place-items-center rounded-2xl bg-surface-3 text-ink-3">
              <Qr size={26} />
            </span>
          )}
          <span className="text-[13.5px] font-semibold">{dragging ? 'Drop it here' : shown ? 'Drop a new picture, or choose one' : 'Drop your QR picture, or choose one'}</span>
          <span className="text-[12px] text-ink-4">PNG, JPEG, WebP or SVG, up to 8 MB</span>
        </label>

        <div aria-live="polite" className="mt-3 min-h-11">
          {picked?.state === 'checking' && <p className="text-[13px] text-ink-3">Reading the code…</p>}
          {picked?.state === 'invalid' && (
            <p className="flex items-start gap-2 text-[13px] text-berry-ink">
              <Alert size={16} className="mt-px shrink-0" />
              {picked.reason}
            </p>
          )}
          {picked?.state === 'ready' && (
            <div className="flex items-start gap-2 text-[13px]">
              <Check size={16} className="mt-px shrink-0 text-mint-ink" />
              <div className="min-w-0">
                <p className="font-semibold text-mint-ink">QR code found</p>
                <p className="truncate font-mono text-[12px] text-ink-3">{describeCode(picked.text)}</p>
              </div>
            </div>
          )}
          {!picked && current?.imageUrl && <p className="text-[13px] text-ink-3">This is the QR customers see now.</p>}
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button type="button" className={ADMIN_GHOST} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={ADMIN_PRIMARY} disabled={busy || picked?.state !== 'ready'} onClick={() => void save()}>
            {busy ? 'Saving…' : current?.imageUrl ? 'Replace QR' : 'Save QR'}
          </button>
        </div>
      </div>
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
  delay,
}: {
  icon: ReactNode;
  name: string;
  detail: string;
  status: string;
  tone: 'on' | 'off';
  action?: ReactNode;
  delay: number;
}) {
  return (
    <li style={{ animationDelay: `${delay}ms` }} className="animate-rise flex flex-wrap items-center gap-3.5 px-4 py-3.5 sm:px-5">
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
