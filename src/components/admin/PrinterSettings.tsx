import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPrinter, deletePrinter, fetchQzCertificate, listPrinters, updatePrinter } from '../../api/printers';
import type { PaperWidth, Printer, PrinterDraft } from '../../api/printers';
import { listFloors, listTables } from '../../api/staff';
import type { DiningTable, Floor, KitchenStation } from '../../domain/types';
import { buildTestSlip } from '../../printing/escpos';
import { connect, disconnect, onClosed, printRaw } from '../../printing/qz';
import { setAgentOn, useStore } from '../../printing/store';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { cx } from '../ui';
import { ADMIN_GHOST, ADMIN_PRIMARY, ADMIN_TINY, Field, Select, TextInput, Toggle, useCommand } from './kit';
import { Check, Printer as PrinterIcon, X } from '../icons';
import { Block } from './profile';

const PAPERS: { value: PaperWidth; label: string }[] = [
  { value: 'MM80', label: '80mm' },
  { value: 'MM58', label: '58mm' },
];
const TYPES = [{ value: 'THERMAL', label: 'Thermal' }];

const BLANK: PrinterDraft = {
  name: '',
  paperWidth: 'MM80',
  ipAddress: '',
  port: 9100,
  fullKot: false,
  stations: [],
  tableAssignment: false,
  tableIds: [],
  floorIds: [],
  isActive: true,
  warnIfUnprinted: true,
};

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

type LedTone = 'ok' | 'wait' | 'bad' | 'off';
const LED: Record<LedTone, string> = {
  ok: 'bg-mint shadow-[0_0_0_3px_rgb(78_203_143_/_0.18)]',
  wait: 'bg-gold shadow-[0_0_0_3px_rgb(255_197_61_/_0.18)] motion-safe:animate-pulse',
  bad: 'bg-berry shadow-[0_0_0_3px_rgb(255_94_122_/_0.18)]',
  off: 'bg-ink-4',
};

/** A status light, like the one on the printer itself. */
function Led({ tone, label }: { tone: LedTone; label: string }) {
  return <span role="img" aria-label={label} className={cx('inline-block size-2.5 shrink-0 rounded-full', LED[tone])} />;
}

const CHIP_TONE = {
  kot: 'bg-flame/14 text-flame-1 ring-flame-2/30',
  bot: 'bg-pass/15 text-pass ring-pass/30',
  full: 'bg-mint/14 text-mint-ink ring-mint/30',
  plain: 'bg-surface-3 text-ink-2 ring-hairline',
};

function Chip({ tone, children }: { tone: keyof typeof CHIP_TONE; children: React.ReactNode }) {
  return <span className={cx('inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold ring-1 ring-inset', CHIP_TONE[tone])}>{children}</span>;
}

function whatItPrints(p: Pick<Printer, 'fullKot' | 'stations' | 'tableAssignment' | 'tableIds' | 'floorIds'>) {
  const chips: { tone: keyof typeof CHIP_TONE; text: string }[] = [];
  if (p.fullKot) chips.push({ tone: 'full', text: 'Full KOT' });
  else {
    if (p.stations.includes('KITCHEN')) chips.push({ tone: 'kot', text: 'KOT' });
    if (p.stations.includes('BAR')) chips.push({ tone: 'bot', text: 'BOT' });
  }
  if (chips.length === 0) chips.push({ tone: 'plain', text: 'Nothing selected' });
  if (p.tableAssignment) {
    const n = p.tableIds.length + p.floorIds.length;
    chips.push({ tone: 'plain', text: n === 0 ? 'No tables picked' : `${n} table${n === 1 ? '' : 's'} & floors` });
  }
  return chips;
}

/** A printer on the pass: name, where it lives, what it prints, and whether it is switched on. */
function PrinterCard({ printer, canEdit, onEdit }: { printer: Printer; canEdit: boolean; onEdit: () => void }) {
  return (
    <li className="group flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-surface-2 px-4 py-3.5 ring-1 ring-hairline ring-inset transition-[background-color,box-shadow] duration-200 hover:bg-surface-3 motion-safe:animate-rise">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface text-ink-2 ring-1 ring-hairline ring-inset" aria-hidden>
        <PrinterIcon size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[15.5px] font-semibold tracking-tight">
          <Led tone={printer.isActive ? 'ok' : 'off'} label={printer.isActive ? 'On' : 'Off'} />
          <span className="truncate">{printer.name}</span>
        </p>
        <p className="mt-0.5 text-[12.5px] text-ink-3 tabular-nums">
          {printer.ipAddress}:{printer.port} · {printer.paperWidth === 'MM80' ? '80mm' : '58mm'}
          {!printer.isActive && ' · switched off'}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {whatItPrints(printer).map((c) => (
            <Chip key={c.text} tone={c.tone}>
              {c.text}
            </Chip>
          ))}
        </div>
      </div>
      {canEdit && (
        <button type="button" className={cx(ADMIN_GHOST, 'opacity-80 transition-opacity group-hover:opacity-100')} onClick={onEdit}>
          Edit
        </button>
      )}
    </li>
  );
}

/* ── The slip, as it will come out ─────────────────────────────── */

type SlipLine = { kind: 'big' | 'invert' | 'text' | 'bold' | 'item' | 'rule'; text?: string };

/** Mirrors what `printing/escpos.ts` puts on paper, so what you see here is what the printer will do. */
function slipLines(draft: PrinterDraft): { lines: SlipLine[]; note?: string } {
  const kitchen = draft.stations.includes('KITCHEN');
  const bar = draft.stations.includes('BAR');
  const where: SlipLine[] = [
    { kind: 'bold', text: 'Table 4' },
    { kind: 'text', text: 'Order #1042            7:42 PM' },
    { kind: 'rule' },
  ];
  const kot: SlipLine[] = [
    { kind: 'item', text: '2x Chicken Momo' },
    { kind: 'text', text: '  Steamed' },
    { kind: 'text', text: '  + Extra sauce' },
    { kind: 'bold', text: '  >> no onion' },
  ];
  const bot: SlipLine[] = [{ kind: 'item', text: '1x Mango Lassi' }, { kind: 'text', text: '  Less sugar' }];

  if (draft.fullKot) {
    return {
      lines: [
        { kind: 'big', text: 'FULL ORDER' },
        { kind: 'text', text: 'KOT #12  BOT #13' },
        ...where,
        { kind: 'invert', text: ' KOT #12 ' },
        ...kot,
        { kind: 'rule' },
        { kind: 'invert', text: ' BOT #13 ' },
        ...bot,
        { kind: 'rule' },
      ],
    };
  }
  if (!kitchen && !bar) return { lines: [] };
  const first = kitchen ? 'KOT #12' : 'BOT #13';
  return {
    lines: [{ kind: 'big', text: first }, ...where, ...(kitchen ? kot : bot), { kind: 'rule' }],
    note: kitchen && bar ? 'BOT prints on its own slip.' : undefined,
  };
}

/** Torn-paper bottom edge. */
function tornEdge(teeth = 16, depth = 7): string {
  const pts = ['0 0', '100% 0', `100% calc(100% - ${depth}px)`];
  for (let i = teeth; i >= 0; i--) pts.push(`${((i / teeth) * 100).toFixed(2)}% ${i % 2 ? `calc(100% - ${depth}px)` : '100%'}`);
  return `polygon(${pts.join(', ')})`;
}
const TORN = tornEdge();

/**
 * Live preview of the slip, scaled to the paper width. Paper is paper in either theme, so its colours are
 * literal. After a successful test print it feeds out of the printer's slot — only on success, never as a
 * stand-in for the work.
 */
function SlipPreview({ draft, printed }: { draft: PrinterDraft; printed: number }) {
  const paper = useRef<HTMLDivElement>(null);
  const { lines, note } = slipLines(draft);
  const narrow = draft.paperWidth === 'MM58';

  useEffect(() => {
    if (!printed || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    paper.current?.animate(
      [
        { clipPath: 'inset(0 0 100% 0)', transform: 'translateY(-14px)' },
        { clipPath: 'inset(0 0 0 0)', transform: 'translateY(0)' },
      ],
      { duration: 1100, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }, [printed]);

  return (
    <div className="grid justify-items-center gap-3" aria-label="Preview of the printed slip">
      <p className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-ink-4">Preview</p>
      <div className={cx('transition-[width] duration-300 ease-out-quart', narrow ? 'w-44' : 'w-60')}>
        {/* the printer's mouth */}
        <div className="h-3 rounded-full bg-bg-deep shadow-[inset_0_2px_4px_rgb(0_0_0_/_0.6)] ring-1 ring-hairline-strong ring-inset" aria-hidden />
        <div className="-mt-1.5 px-2">
          <div
            ref={paper}
            style={{ clipPath: TORN }}
            className="bg-[#f6f1e7] px-3.5 pt-4 pb-6 font-mono text-[11px] leading-[1.45] text-[#26211c] shadow-lift"
          >
            {lines.length === 0 ? (
              <p className="py-8 text-center text-[#7a6f63]">Pick KOT, BOT or Full KOT to see the slip.</p>
            ) : (
              lines.map((l, i) =>
                l.kind === 'rule' ? (
                  <p key={i} className="overflow-hidden whitespace-nowrap text-[#9a8f82]">
                    {'-'.repeat(40)}
                  </p>
                ) : l.kind === 'big' ? (
                  <p key={i} className="text-center text-[19px] font-bold leading-tight">
                    {l.text}
                  </p>
                ) : l.kind === 'invert' ? (
                  <p key={i} className="mt-1 w-fit bg-[#26211c] px-1 font-bold text-[#f6f1e7]">
                    {l.text}
                  </p>
                ) : (
                  <p key={i} className={cx('whitespace-pre', l.kind === 'item' && 'mt-1 text-[13px] font-bold', l.kind === 'bold' && 'font-bold')}>
                    {l.text}
                  </p>
                ),
              )
            )}
          </div>
        </div>
      </div>
      <p className="max-w-[16rem] text-center text-[12px] leading-snug text-ink-4">{note ?? 'Sample dishes. Real tickets use your menu.'}</p>
    </div>
  );
}

function SetupGuide({ hasCertificate, onClose }: { hasCertificate: boolean; onClose: () => void }) {
  const steps: { title: string; body: ReactNode }[] = [
    {
      title: 'Put the printer on the restaurant network',
      body: 'Give the thermal printer a fixed IP on the same Wi-Fi or LAN as the laptop that will print. Write that IP down. The port is 9100 unless the printer says otherwise. The printer does not need a computer of its own.',
    },
    {
      title: 'Install QZ Tray on that laptop',
      body: (
        <>
          Download it from{' '}
          <a href="https://qz.io/download" target="_blank" rel="noreferrer" className="font-medium text-ink underline decoration-hairline-strong underline-offset-2">
            qz.io/download
          </a>{' '}
          and leave it running. The dashboard sends slips to QZ, and QZ sends them to the printer.
        </>
      ),
    },
    {
      title: 'Let QZ trust this site',
      body: hasCertificate ? (
        <>
          Download the certificate on this page and save it as override.crt in the QZ Tray folder for this laptop, then restart QZ Tray. Every restaurant uses this same file.
          <span className="mt-2 grid gap-1">
            <span>
              Windows <span className="font-mono text-[12.5px] text-ink-2">C:\Program Files\QZ Tray</span>
            </span>
            <span>
              Mac <span className="font-mono text-[12.5px] break-all text-ink-2">/Applications/QZ Tray.app/Contents/Resources</span>
            </span>
            <span>
              Linux <span className="font-mono text-[12.5px] text-ink-2">/opt/qz-tray</span>
            </span>
          </span>
        </>
      ) : (
        'The first time this page connects, QZ asks whether to trust this site. Choose Allow and Remember this decision so it does not ask for every ticket.'
      ),
    },
    {
      title: 'Turn this laptop on for printing',
      body: 'Switch on “Use this PC to print” and leave the dashboard open. Slips only come out while it is open here. One laptop is enough. A second one left on still prints each slip only once.',
    },
    {
      title: 'Add the printer',
      body: 'Name it, enter the IP and port, and pick the paper width. Kitchen tickets are KOT, bar tickets are BOT. Full KOT puts the whole order on one slip. Table assignment limits a printer to the tables or floors you tick.',
    },
    {
      title: 'Print a test slip',
      body: 'Send a test from the printer form and check the paper. If the line of numbers wraps, switch the paper width and test again.',
    },
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="presentation" onClick={onClose}>
      <div
        className="animate-pop max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-surface p-5 text-ink shadow-deep ring-1 ring-hairline ring-inset sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-setup-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="print-setup-title" className="font-display text-[22px] leading-tight font-black">
            Set up printing
          </h2>
          <button type="button" aria-label="Close" className={`${ADMIN_TINY} text-ink-3 hover:text-ink`} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <ol className="mt-5 grid list-decimal gap-4 pl-5 marker:text-[13px] marker:font-semibold marker:text-ink-2">
          {steps.map((step) => (
            <li key={step.title} className="pl-1.5">
              <p className="text-[14.5px] font-semibold tracking-tight">{step.title}</p>
              <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-3">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function downloadOverride(certificate: string) {
  const url = URL.createObjectURL(new Blob([certificate], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'override.crt';
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Where the kitchen's and bar's tickets come out. The branch keeps a list of named network printers (so it is
 * the same on every PC); one PC — the one with QZ Tray running — is switched on to actually send to them.
 */
export function PrinterSettings({ canEdit }: { canEdit: boolean }) {
  const { allows } = useAuth();
  const { agentOn } = useStore();
  const [link, setQz] = useState<{ state: 'connecting' | 'ready' | 'error'; message?: string }>({ state: 'connecting' });
  // QZ Tray is only touched on a PC that is switched on to print: no connection, prompt or red error for one that isn't.
  const qz: { state: 'idle' | 'connecting' | 'ready' | 'error'; message?: string } = agentOn ? link : { state: 'idle' };
  const [editing, setEditing] = useState<{ id: string | null; draft: PrinterDraft } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const printers = useAsync(() => listPrinters(), []);
  const certificate = useAsync(() => fetchQzCertificate().catch(() => null), []);
  const qzCertificatePem = certificate.data;

  const attempt = useCallback(() => {
    connect()
      .then(() => setQz({ state: 'ready' }))
      .catch((e: unknown) => setQz({ state: 'error', message: e instanceof Error ? e.message : String(e) }));
  }, []);

  useEffect(() => {
    onClosed(() => setQz({ state: 'error', message: 'QZ Tray closed the connection.' }));
  }, []);

  useEffect(() => {
    if (agentOn) attempt();
    else void disconnect().catch(() => {});
  }, [agentOn, attempt]);

  return (
    <div className="grid gap-6">
      <Block title="This PC" hint="Saved on this computer only" delay={0}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-surface-2 px-4 py-3 ring-1 ring-hairline ring-inset">
          <Led
            tone={qz.state === 'ready' ? 'ok' : qz.state === 'connecting' ? 'wait' : qz.state === 'error' ? 'bad' : 'off'}
            label={qz.state === 'ready' ? 'Connected' : qz.state === 'connecting' ? 'Connecting' : qz.state === 'error' ? 'Not connected' : 'Off'}
          />
          <p className="text-[14px] font-semibold">QZ Tray</p>
          <p className="text-[13.5px] text-ink-3">
            {qz.state === 'idle' && 'Not in use. Switch on “Use this PC to print” below to connect.'}
            {qz.state === 'ready' && 'Connected. This PC can print.'}
            {qz.state === 'connecting' && 'Connecting…'}
            {qz.state === 'error' && 'Not reachable.'}
          </p>
          {qz.state === 'error' && (
            <button
              type="button"
              className={cx(ADMIN_GHOST, 'ml-auto')}
              onClick={() => {
                setQz({ state: 'connecting' });
                attempt();
              }}
            >
              Try again
            </button>
          )}
        </div>
        {qz.state === 'error' && (
          <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
            {qz.message}. Install and start QZ Tray from qz.io/download on this PC, and allow this site when it asks.
          </p>
        )}
        {allows('orders:advance') && (
          <div className="mt-3">
            <Toggle
              checked={agentOn}
              onChange={setAgentOn}
              label="Use this PC to print"
              hint="Slips print while the dashboard is open here. Switch it on for one PC only — if two are on, each slip still prints once."
            />
          </div>
        )}
        {allows('orders:advance') && qzCertificatePem && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button type="button" className={ADMIN_GHOST} onClick={() => downloadOverride(qzCertificatePem)}>
              Download certificate
            </button>
            <p className="max-w-[62ch] text-[13px] leading-relaxed text-ink-3">
              The same file for every restaurant. Save it as override.crt, then restart QZ Tray. The setup guide lists the folder for Windows, Mac, and Linux.
            </p>
          </div>
        )}
      </Block>

      <Block
        title="Printers"
        hint={canEdit ? undefined : 'Only an owner can change these'}
        delay={60}
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ADMIN_GHOST} onClick={() => setGuideOpen(true)}>
              Setup guide
            </button>
            {canEdit && !editing && (
              <button type="button" className={ADMIN_GHOST} onClick={() => setEditing({ id: null, draft: BLANK })}>
                Add printer
              </button>
            )}
          </div>
        }
      >
        {printers.loading && !printers.data ? (
          <p className="text-[13.5px] text-ink-3">Loading…</p>
        ) : (printers.data ?? []).length === 0 && !editing ? (
          <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-hairline-strong px-6 py-9 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset" aria-hidden>
              <PrinterIcon size={28} />
            </span>
            <p className="text-[16px] font-semibold tracking-tight">No printers yet</p>
            <p className="max-w-[36ch] text-[14px] leading-relaxed text-ink-3">
              Add a network thermal printer and kitchen (KOT) and bar (BOT) tickets will come out on their own.
            </p>
            {canEdit && (
              <button type="button" className={ADMIN_PRIMARY} onClick={() => setEditing({ id: null, draft: BLANK })}>
                Add your first printer
              </button>
            )}
          </div>
        ) : (
          <ul className="grid gap-2.5">
            {(printers.data ?? []).map((p) => (
              <PrinterCard key={p.id} printer={p} canEdit={canEdit} onEdit={() => setEditing({ id: p.id, draft: { ...BLANK, ...p } })} />
            ))}
          </ul>
        )}
      </Block>

      {editing && (
        <PrinterForm
          key={editing.id ?? 'new'}
          id={editing.id}
          initial={editing.draft}
          onDone={(changed) => {
            setEditing(null);
            if (changed) printers.reload?.();
          }}
        />
      )}
      {guideOpen && <SetupGuide hasCertificate={Boolean(qzCertificatePem)} onClose={() => setGuideOpen(false)} />}
    </div>
  );
}

function PrinterForm({ id, initial, onDone }: { id: string | null; initial: PrinterDraft; onDone: (changed: boolean) => void }) {
  const staff = useStaff();
  const { run, busy, pending } = useCommand();
  const [draft, setDraft] = useState<PrinterDraft>(initial);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [printed, setPrinted] = useState(0);
  const tables = useAsync(() => (draft.tableAssignment ? listTables(staff) : Promise.resolve([] as DiningTable[])), [staff, draft.tableAssignment]);
  const floors = useAsync(() => (draft.tableAssignment ? listFloors(staff) : Promise.resolve([] as Floor[])), [staff, draft.tableAssignment]);

  const patch = (next: Partial<PrinterDraft>) => setDraft((d) => ({ ...d, ...next }));
  const toggleIn = <K extends 'tableIds' | 'floorIds' | 'stations'>(key: K, value: PrinterDraft[K][number], on: boolean) =>
    patch({ [key]: on ? [...(draft[key] as string[]), value as string] : (draft[key] as string[]).filter((v) => v !== value) } as Partial<PrinterDraft>);

  const ipOk = IPV4.test(draft.ipAddress.trim());
  const valid = draft.name.trim().length > 0 && ipOk;

  const save = () =>
    void run(
      'save',
      () => {
        const body = { ...draft, name: draft.name.trim(), ipAddress: draft.ipAddress.trim() };
        return id ? updatePrinter(id, body) : createPrinter(body);
      },
      'Printer saved',
    ).then((ok) => ok && onDone(true));

  const test = () => {
    setTestResult('Connecting to the printer…');
    printRaw({ host: draft.ipAddress.trim(), port: draft.port }, buildTestSlip(draft.name.trim() || 'Printer', draft.paperWidth === 'MM80' ? '80mm' : '58mm'))
      .then(() => {
        setTestResult('Sent. Check the paper.');
        setPrinted((n) => n + 1);
      })
      .catch((e: unknown) => setTestResult(`Failed: ${e instanceof Error ? e.message : String(e)}`));
  };

  return (
    <Block title={id ? 'Edit printer' : 'Add printer'} delay={0}>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="grid gap-5">
        <Field label="Printer name *">
          <TextInput value={draft.name} onChange={(name) => patch({ name })} maxLength={40} placeholder="Ex: Cafe, Bar1, Bar2" />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Paper width *">
            <Select<PaperWidth> aria-label="Paper width" value={draft.paperWidth} onChange={(paperWidth) => patch({ paperWidth })} options={PAPERS} />
          </Field>
          <Field label="Printer type *">
            <Select aria-label="Printer type" value="THERMAL" onChange={() => {}} options={TYPES} />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-[1fr_8rem]">
          <Field
            label="IP address *"
            error={draft.ipAddress && !ipOk ? 'Enter an address like 192.168.1.50' : undefined}
            hint="Printed on the printer's self-test slip. The printer must be on the same network as the PC that prints."
          >
            <TextInput value={draft.ipAddress} onChange={(ipAddress) => patch({ ipAddress: ipAddress.trim() })} placeholder="Enter IP address of your printer" />
          </Field>
          <Field label="Port">
            <TextInput value={String(draft.port)} onChange={(port) => patch({ port: Number(port.replace(/\D/g, '')) || 9100 })} />
          </Field>
        </div>

        <div className="grid gap-1 border-t border-hairline pt-4">
          <h3 className="text-[15px] font-semibold">Auto print KOT &amp; BOT</h3>
          <Toggle
            checked={draft.fullKot}
            onChange={(fullKot) => patch({ fullKot })}
            label="Full KOT"
            hint="Prints the whole order on one slip, every station together — for a pass or a single printer."
          />
          <label className="flex items-center gap-2.5 py-2 text-[14.5px]">
            <input type="checkbox" className="size-4 accent-flame" checked={draft.tableAssignment} onChange={(e) => patch({ tableAssignment: e.target.checked })} />
            Enable table assignment
          </label>

          {draft.tableAssignment && (
            <div className="grid gap-4 rounded-2xl bg-surface-2 p-4 ring-1 ring-hairline ring-inset">
              <p className="text-[13px] text-ink-3">Only orders for what you tick print here. Tick nothing and this printer prints nothing; delivery orders never match.</p>
              <Choices
                title="Floors"
                loading={floors.loading && !floors.data}
                items={(floors.data ?? []).map((f) => ({ id: f.id, label: f.name }))}
                selected={draft.floorIds}
                onToggle={(fid, on) => toggleIn('floorIds', fid, on)}
              />
              <Choices
                title="Tables"
                loading={tables.loading && !tables.data}
                items={(tables.data ?? []).map((t) => ({ id: t.id, label: t.name }))}
                selected={draft.tableIds}
                onToggle={(tid, on) => toggleIn('tableIds', tid, on)}
              />
            </div>
          )}

          <div className={cx('mt-1 grid gap-1', draft.fullKot && 'opacity-50')}>
            <Toggle
              checked={draft.stations.includes('BAR')}
              onChange={(on) => toggleIn('stations', 'BAR' as KitchenStation, on)}
              disabled={draft.fullKot}
              label="BOT"
              hint="Bar Order Ticket"
            />
            <Toggle
              checked={draft.stations.includes('KITCHEN')}
              onChange={(on) => toggleIn('stations', 'KITCHEN' as KitchenStation, on)}
              disabled={draft.fullKot}
              label="KOT"
              hint="Kitchen Order Ticket"
            />
            <p className="text-[12.5px] text-ink-4">{draft.fullKot ? 'Full KOT is on, so every station prints here.' : 'Prints dishes assigned to these ticket types only.'}</p>
          </div>
        </div>

        <Toggle checked={draft.isActive} onChange={(isActive) => patch({ isActive })} label="Printer is on" hint="Switch off to stop sending slips here without deleting it." />
        <Toggle
          checked={draft.warnIfUnprinted}
          onChange={(warnIfUnprinted) => patch({ warnIfUnprinted })}
          label="Warn me if a slip doesn't print"
          hint="Shows a warning to the front of house when a slip is waiting a minute or more. Switch off for a printer you only use now and then; it still prints whenever a PC is on."
        />

        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
          <button type="button" className={ADMIN_GHOST} disabled={!ipOk} onClick={test}>
            Test print
          </button>
          {testResult && (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-3" aria-live="polite">
              {testResult.startsWith('Sent') && <Check size={14} className="text-mint-ink" />}
              {testResult}
            </span>
          )}
          <span className="flex-1" />
          {id && (
            <button
              type="button"
              className={cx(ADMIN_GHOST, 'text-berry-ink')}
              disabled={busy}
              onClick={() => void run('delete', () => deletePrinter(id), 'Printer removed').then((ok) => ok && onDone(true))}
            >
              {pending === 'delete' ? 'Removing…' : 'Delete'}
            </button>
          )}
          <button type="button" className={ADMIN_GHOST} onClick={() => (id ? setDraft(initial) : onDone(false))}>
            {id ? 'Reset' : 'Cancel'}
          </button>
          <button type="button" className={ADMIN_PRIMARY} disabled={busy || !valid} onClick={save}>
            {pending === 'save' ? 'Saving…' : 'Save printer'}
          </button>
        </div>
      </div>
      <div className="md:sticky md:top-24 md:self-start">
        <SlipPreview draft={draft} printed={printed} />
      </div>
      </div>
    </Block>
  );
}

function Choices({
  title,
  items,
  selected,
  loading,
  onToggle,
}: {
  title: string;
  items: { id: string; label: string }[];
  selected: string[];
  loading: boolean;
  onToggle: (id: string, on: boolean) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-semibold text-ink-2">{title}</legend>
      {loading ? (
        <p className="text-[13px] text-ink-3">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-ink-4">None set up.</p>
      ) : (
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" className="size-4 accent-flame" checked={selected.includes(item.id)} onChange={(e) => onToggle(item.id, e.target.checked)} />
              {item.label}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
