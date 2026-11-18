import { useEffect, useRef } from 'react';
import { formatMoney } from '../../domain/money';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** One digit as a 0–9 strip sliding to its value, so going 1 → 9 passes 2…8 (and 9 → 1 passes them back). Longer trips take longer. */
function Digit({ digit }: { digit: number }) {
  const from = useRef(digit);
  const ms = 280 + Math.abs(digit - from.current) * 70;
  useEffect(() => {
    from.current = digit;
  }, [digit]);
  return (
    <span className="inline-block h-[1.15em] overflow-hidden align-bottom leading-[1.15]" aria-hidden>
      <span className="roll-strip flex flex-col" style={{ transform: `translateY(${-digit * 1.15}em)`, transitionDuration: `${ms}ms` }}>
        {DIGITS.map((d) => (
          <span key={d} className="block h-[1.15em]">
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

/** An amount whose digits roll through every value between the old and the new one. */
export function AnimatedMoney({ value, currency }: { value: number; currency: string }) {
  const text = formatMoney(value, currency);
  const chars = [...text];
  return (
    <span aria-label={text}>
      {chars.map((ch, i) =>
        /\d/.test(ch) ? (
          // Keyed from the right so a digit keeps its column when the amount gains or loses a digit.
          <Digit key={chars.length - i} digit={Number(ch)} />
        ) : (
          <span key={chars.length - i} aria-hidden>
            {ch}
          </span>
        ),
      )}
    </span>
  );
}
