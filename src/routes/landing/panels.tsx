import type { ReactNode } from 'react';
import { cx } from '../../components/ui';
import { Panel, PanelBar } from './kit';

/**
 * The product, drawn from the same numbers the demo restaurant runs on. Each
 * panel is a real screen of the app reduced to what the sentence beside it
 * claims — no decoration that is not data.
 */

const tabular = 'font-mono tabular-nums';

export function BillPanel({ className }: { className?: string }) {
  const lines = [
    ['2 × Chicken Sekuwa', '900'],
    ['1 × Buff Jhol Momo', '320'],
    ['3 × Masala Chiya', '210'],
  ] as const;
  return (
    <Panel className={className} label="Counter bill">
      <PanelBar title="Table 12 · Terrace" right={<span className="label text-flame-1">Open bill</span>} />
      <div className="p-4 text-[13px] text-ink-2">
        <ul className="flex flex-col gap-2">
          {lines.map(([name, price]) => (
            <li key={name} className="flex justify-between gap-3">
              <span>{name}</span>
              <span className={cx(tabular, 'text-ink')}>{price}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 flex flex-col gap-1.5 border-t border-hairline pt-3 text-[12.5px] text-ink-3">
          <div className="flex justify-between"><dt>Subtotal</dt><dd className={tabular}>1,430</dd></div>
          <div className="flex justify-between"><dt>Service charge 10%</dt><dd className={tabular}>143</dd></div>
          <div className="flex justify-between"><dt>Tax 13%</dt><dd className={tabular}>204</dd></div>
          <div className="flex justify-between border-t border-hairline pt-2 text-[14px] font-semibold text-ink">
            <dt>Total</dt><dd className={tabular}>Rs. 1,777</dd>
          </div>
        </dl>
        <div className="mt-4 flex gap-2 text-[12px] font-semibold">
          <span className="rounded-full bg-flame px-3.5 py-1.5 text-white">Settle · Cash</span>
          <span className="rounded-full bg-surface-2 px-3.5 py-1.5 text-ink-2 ring-1 ring-hairline ring-inset">Fonepay QR</span>
          <span className="rounded-full bg-surface-2 px-3.5 py-1.5 text-ink-2 ring-1 ring-hairline ring-inset">Split</span>
        </div>
      </div>
    </Panel>
  );
}

export function KitchenPanel({ className }: { className?: string }) {
  const tickets = [
    { t: 'Table 12', items: ['2 × Chicken Sekuwa', '1 × Buff Jhol Momo'], age: '4 min', state: 'Cooking', tone: 'text-flame-1' },
    { t: 'Table 4', items: ['1 × Thakali Khana Set'], age: '9 min', state: 'Cooking', tone: 'text-flame-1' },
    { t: 'Delivery #31', items: ['4 × Chicken Steam Momo'], age: '1 min', state: 'New', tone: 'text-ink-3' },
  ];
  return (
    <Panel className={className} label="Kitchen display">
      <PanelBar title="Kitchen · 3 open" right={<span className="label text-ink-4">Bar screen</span>} />
      <ul className="grid gap-px bg-hairline sm:grid-cols-3">
        {tickets.map((k) => (
          <li key={k.t} className="bg-surface p-3.5">
            <div className="flex items-baseline justify-between">
              <b className="text-[13px] text-ink">{k.t}</b>
              <span className={cx(tabular, 'text-[11px] text-ink-4')}>{k.age}</span>
            </div>
            <ul className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
              {k.items.map((i) => <li key={i}>{i}</li>)}
            </ul>
            <p className={cx('mt-3 flex items-center gap-1 text-[11.5px] font-bold', k.tone)}>
              {k.state}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function StockPanel({ className }: { className?: string }) {
  const rows = [
    { n: 'Chicken thigh', left: '6.2 kg', par: 22, tone: 'bg-gold' },
    { n: 'Mustard oil', left: '14 L', par: 70, tone: 'bg-mint' },
    { n: 'Momo wrappers', left: '320 pc', par: 64, tone: 'bg-mint' },
    { n: 'Charcoal', left: '9 kg', par: 18, tone: 'bg-flame' },
  ];
  const margins = [
    ['Chicken Sekuwa', 'Rs. 450', '58%'],
    ['Buff Jhol Momo', 'Rs. 320', '64%'],
    ['Thakali Khana Set', 'Rs. 520', '41%'],
  ];
  return (
    <Panel className={className} label="Stock and margins">
      <PanelBar title="Stock · Thamel branch" right={<span className="label text-flame-1">2 to buy</span>} />
      <div className="grid gap-px bg-hairline sm:grid-cols-2">
        <ul className="flex flex-col gap-3 bg-surface p-4">
          {rows.map((r) => (
            <li key={r.n} className="text-[12.5px]">
              <div className="flex justify-between text-ink-2"><span>{r.n}</span><span className={cx(tabular, 'text-ink')}>{r.left}</span></div>
              <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-3">
                <span className={cx('block h-full rounded-full', r.tone)} style={{ width: `${r.par}%` }} />
              </span>
            </li>
          ))}
        </ul>
        <div className="bg-surface p-4">
          <p className="label text-ink-4">Dish margin</p>
          <ul className="mt-2 flex flex-col gap-2.5 text-[12.5px] text-ink-2">
            {margins.map(([n, p, m]) => (
              <li key={n} className="flex items-baseline justify-between gap-2">
                <span>{n}<span className={cx(tabular, 'ml-1.5 text-[11px] text-ink-4')}>{p}</span></span>
                <b className={cx(tabular, 'text-ink')}>{m}</b>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

export function BooksPanel({ className }: { className?: string }): ReactNode {
  const rows = [
    ['Sales · Thu', '+ 84,260', 'text-ink'],
    ['Supplier paid · Fresh Farm', '− 18,300', 'text-ink-2'],
    ['Rent · paid', '− 45,000', 'text-ink-2'],
    ['Payment received · Hotel Annapurna', '+ 12,500', 'text-ink'],
  ] as const;
  return (
    <Panel className={className} label="Cash book">
      <PanelBar title="Cash book · this week" right={<span className="label text-ink-4">Sample data</span>} />
      <ul className="divide-y divide-hairline px-4 text-[13px]">
        {rows.map(([n, v, c]) => (
          <li key={n} className="flex justify-between gap-3 py-2.5 text-ink-2">
            <span>{n}</span>
            <span className={cx(tabular, c)}>{v}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
