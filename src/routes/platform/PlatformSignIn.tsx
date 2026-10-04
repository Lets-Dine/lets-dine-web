import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/store';
import { IS_LIVE_API } from '../../api/http';
import { readPlatformKey, unlockPlatform } from '../../api/platform';
import { AdminThemeToggle } from '../../state/AdminTheme';
import { usePageTitle } from '../../state/usePageTitle';
import { ADMIN_PRIMARY, Field, PANEL, TextInput } from '../../components/admin/kit';
import { Building, Cash, Shield } from '../../components/icons';
import { DISPLAY, SHELL, cx } from '../../components/ui';

/**
 * Operator unlock. The key is the same shared secret the API checks on
 * `x-platform-key` — there is no platform user table in the MVP.
 */
export function PlatformSignIn() {
  usePageTitle('Sign in · Platform admin');
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/platform';

  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (readPlatformKey()) return <Navigate to={from} replace />;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await unlockPlatform(key);
      navigate(from, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not unlock platform admin.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={cx(SHELL, 'relative grid place-items-center px-4 py-10')}>
      <AdminThemeToggle className="absolute right-4 top-[calc(12px+var(--safe-t))]" />
      <div className="grid w-full max-w-[920px] items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="hidden lg:block">
          <div className={cx(DISPLAY, 'text-[44px]')}>Let’s Dine</div>
          <p className="mt-1 text-[15px] font-semibold text-ink-3">Platform admin</p>
          <ul className="mt-9 grid gap-5">
            {[
              { icon: Building, title: 'Onboard restaurants', text: 'Create a restaurant and its owner in three short steps, then hand over the sign-in.' },
              { icon: Cash, title: 'Keep billing moving', text: 'See what is overdue, nudge the owner, mark payments as they land.' },
              { icon: Shield, title: 'Stay in control', text: 'Every operator action is recorded, and access can be paused or restored any time.' },
            ].map((f) => (
              <li key={f.title} className="flex gap-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-flame-2 ring-1 ring-hairline ring-inset">
                  <f.icon size={18} />
                </span>
                <span>
                  <span className="block text-[14.5px] font-semibold">{f.title}</span>
                  <span className="block max-w-[44ch] text-[13.5px] leading-relaxed text-ink-3">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="w-full">
          <div className="mb-6 text-center lg:hidden">
            <h1 className={cx(DISPLAY, 'text-[28px]')}>Platform admin</h1>
            <p className="mt-1.5 text-[14px] text-ink-3">Restaurants, billing and plans.</p>
          </div>
          <form
            className={cx(PANEL, 'grid gap-4 p-6')}
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="hidden lg:block">
              <h1 className="text-[20px] font-semibold tracking-tight">Unlock the console</h1>
              <p className="mt-1 text-[13.5px] text-ink-3">Enter the platform key you were given.</p>
            </div>
            <Field label="Platform key" hint={IS_LIVE_API ? 'Must match the backend PLATFORM_ADMIN_KEY.' : 'Demo mode — any non-empty key unlocks this view.'}>
              <TextInput value={key} onChange={setKey} type="password" placeholder="••••••••" autoFocus />
            </Field>

            {error && (
              <p role="alert" className="rounded-xl bg-berry/10 px-3.5 py-2.5 text-[13.5px] text-berry ring-1 ring-berry/25 ring-inset">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy || !key.trim()} className={cx(ADMIN_PRIMARY, 'h-12 w-full text-[15px]')}>
              {busy ? 'Checking…' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
