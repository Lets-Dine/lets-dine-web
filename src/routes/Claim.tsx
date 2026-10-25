import { useLayoutEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { salesWhatsAppUrl } from '../domain/contact';
import { usePageTitle } from '../state/usePageTitle';
import { ArrowUpRight, Check, WhatsApp } from '../components/icons';
import { DISPLAY, INPUT, cx } from '../components/ui';

const PAPER = '#f6f1e7';
const ACTION =
  'inline-flex h-12.5 w-full items-center justify-center gap-2 rounded-full px-6 text-[15.5px] font-semibold tracking-tight transition-move active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40';

/**
 * Where a restaurant owner activates a Feastox restaurant that was set up for them. There's no ownership check
 * in the backend yet, so this sends a claim request to the Feastox team on WhatsApp for them to verify by hand.
 */
export function Claim() {
  usePageTitle('Claim your restaurant — Feastox', 'Your restaurant is already on Feastox. Claim it to manage your menu, prices and orders.');
  const [params] = useSearchParams();
  const restaurant = params.get('n')?.slice(0, 80) ?? '';
  const slug = params.get('r')?.slice(0, 80) ?? '';
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Cream stock like the signup it sits beside — see GetStarted.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector('meta[name="theme-color"]');
    const prev = meta?.getAttribute('content') ?? null;
    root.setAttribute('data-page', 'landing');
    if (prev !== null) meta?.setAttribute('content', PAPER);
    return () => {
      root.removeAttribute('data-page');
      if (prev !== null) meta?.setAttribute('content', prev);
    };
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Tell us your name so we know who to look for.');
    if (!/^\d{10}$/.test(phone)) return setError('Enter a 10 digit phone number.');
    setError(null);
    const who = restaurant ? `${restaurant}${slug ? ` (${slug})` : ''}` : slug || 'my restaurant';
    window.open(salesWhatsAppUrl(`Hi, I'm ${name.trim()} (${phone.trim()}). I own ${who} on Feastox and I'd like to claim it.`), '_blank', 'noopener');
    setSent(true);
  };

  return (
    <main className="min-h-dvh bg-bg text-ink">
      <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col justify-center gap-8 px-6 py-12">
        {sent ? (
          <div className="animate-rise flex flex-col gap-6">
            <span className="grid size-14 place-items-center rounded-full bg-mint/20 text-mint-ink ring-1 ring-mint/40 ring-inset">
              <Check size={26} />
            </span>
            <div className="flex flex-col gap-2">
              <h1 className={cx(DISPLAY, 'text-[clamp(28px,6vw,40px)]')}>Request sent{restaurant ? ` for ${restaurant}` : ''}</h1>
              <p className="text-[16px] leading-relaxed text-ink-2">Send the WhatsApp message that just opened. We'll confirm it's really you, then set up your login.</p>
            </div>
            <ol className="flex flex-col divide-y divide-hairline">
              {['Send the message on WhatsApp', "We confirm you're the owner", 'You sign in and the menu is yours'].map((t, i) => (
                <li key={t} className="flex items-baseline gap-3.5 py-3 text-[15px]">
                  <span className="font-mono text-[13px] font-semibold text-flame-1">{String(i + 1).padStart(2, '0')}</span>
                  {t}
                </li>
              ))}
            </ol>
            <div className="flex flex-col gap-2.5">
              <Link to="/admin/signin" className={cx(ACTION, 'bg-flame text-white shadow-flame')}>Already have your login? Sign in</Link>
              <button type="button" onClick={() => setSent(false)} className={cx(ACTION, 'cursor-pointer bg-transparent text-ink ring-1 ring-hairline-strong ring-inset hover:bg-surface-2')}>Edit my details</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="animate-rise flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className={cx(DISPLAY, 'text-[clamp(28px,6vw,40px)]')}>{restaurant ? `Claim ${restaurant}` : 'Claim your restaurant'}</h1>
              <p className="text-[16px] leading-relaxed text-ink-2">Your menu is already live on Feastox. Tell us who you are and we'll hand it over, so you can manage the menu, prices and orders yourself.</p>
            </div>
            <div className="flex flex-col gap-3">
              <label className="grid gap-1.5 text-[13px] font-semibold text-ink-2">
                Your name
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} className={cx(INPUT, 'h-12')} />
              </label>
              <label className="grid gap-1.5 text-[13px] font-semibold text-ink-2">
                Phone number
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="98XXXXXXXX"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={10}
                  className={cx(INPUT, 'h-12')}
                />
              </label>
              <p role="alert" className="text-[13px] text-berry-ink empty:hidden">{error}</p>
            </div>
            <div className="flex flex-col gap-2.5">
              <button type="submit" className={cx(ACTION, 'cursor-pointer bg-flame text-white shadow-flame')}>
                <WhatsApp size={17} /> Send claim request
              </button>
              <Link to="/" className={cx(ACTION, 'bg-transparent text-ink ring-1 ring-hairline-strong ring-inset hover:bg-surface-2')}>
                Learn more about Feastox <ArrowUpRight size={16} />
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
