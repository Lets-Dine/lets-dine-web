import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/store';
import { IS_LIVE_API } from '../../api/http';
import { readPlatformKey, unlockPlatform } from '../../api/platform';
import { AdminThemeToggle } from '../../state/AdminTheme';
import { usePageTitle } from '../../state/usePageTitle';
import { ADMIN_PRIMARY, Field, PANEL, TextInput } from '../../components/admin/kit';
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
      <div className="w-full max-w-[440px]">
        <div className="mb-6 text-center">
          <h1 className={cx(DISPLAY, 'text-[28px]')}>Platform admin</h1>
          <p className="mt-1.5 text-[14px] text-ink-3">List restaurants and onboard a new one with its owner.</p>
        </div>

        <form
          className={cx(PANEL, 'grid gap-4 p-5')}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
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

        <p className="mt-6 text-center text-[13px] text-ink-4">
          <Link to="/demo" className="font-semibold text-ink-3 hover:text-ink">
            ← Back to the diner app
          </Link>
        </p>
      </div>
    </main>
  );
}
