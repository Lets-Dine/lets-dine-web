import { useState } from 'react';
import { cx } from '../ui';
import { INPUT_BOX } from './kit';

const SCALES: Record<string, { label: string; factor: number }[]> = {
  g: [
    { label: 'g', factor: 1 },
    { label: 'kg', factor: 1000 },
  ],
  ml: [
    { label: 'ml', factor: 1 },
    { label: 'L', factor: 1000 },
  ],
  pcs: [{ label: 'pcs', factor: 1 }],
};

/**
 * A quantity typed the way a cook says it — "2.5 kg" — and handed on in whole base units, which
 * is what the server stores. Remount it (change `key`) to clear it. `big` starts it on kg / L, for an
 * ingredient already counted in those, so typing "6" next to "2.3 kg" means 6 kg rather than 6 g.
 */
export function QtyField({ unit, onChange, placeholder = '0', big = false }: { unit: string; onChange: (baseUnits: number | '') => void; placeholder?: string; big?: boolean }) {
  const scales = SCALES[unit] ?? [{ label: unit, factor: 1 }];
  const [text, setText] = useState('');
  const [scale, setScale] = useState(big && scales.length > 1 ? 1 : 0);
  const emit = (t: string, s: number) => {
    const n = Number.parseFloat(t);
    onChange(Number.isFinite(n) ? Math.round(n * scales[s].factor) : '');
  };
  return (
    <span className="flex gap-2">
      <input
        className={cx(INPUT_BOX, 'tnum')}
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const next = e.target.value.replace(/[^0-9.]/g, '');
          setText(next);
          emit(next, scale);
        }}
      />
      {scales.length > 1 ? (
        <select
          aria-label="Unit"
          className={cx(INPUT_BOX, 'w-20 shrink-0 cursor-pointer')}
          value={scale}
          onChange={(e) => {
            const s = Number(e.target.value);
            setScale(s);
            emit(text, s);
          }}
        >
          {scales.map((s, i) => (
            <option key={s.label} value={i} className="bg-surface-2">
              {s.label}
            </option>
          ))}
        </select>
      ) : (
        <span className="flex w-20 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-[13.5px] font-semibold text-ink-3 ring-1 ring-hairline ring-inset">{scales[0].label}</span>
      )}
    </span>
  );
}
