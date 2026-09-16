import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/store';
import { staffDirectory } from '../../api/admin';
import { IS_LIVE_API } from '../../api/http';
import { DEMO_PIN } from '../../data/staff';
import { ROLE_LABEL, ROLE_SCOPE } from '../../domain/permissions';
import { useAuth } from '../../state/AuthContext';
import { ADMIN_PRIMARY, Field, PANEL, TextInput } from '../../components/admin/kit';
import { DISPLAY, SHELL, cx } from '../../components/ui';

/**
 * Staff sign-in. The accounts are demo fixtures and say so — what this screen
 * is really demonstrating is that the dashboard has a *subject*: every action
 * past this point is attributed to a person and a role, which is what makes an
 * audit log worth keeping.
 */
export function SignIn() {
  const { staff, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/admin';

  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (staff) return <Navigate to={from} replace />;

  const submit = async (withEmail: string, withPin: string) => {
    setBusy(true);
    setError(null);
    try {
      await signIn(withEmail, withPin);
      navigate(from, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={cx(SHELL, 'grid place-items-center px-4 py-10')}>
      <div className="w-full max-w-[440px]">
        <div className="mb-6 text-center">
          <h1 className={cx(DISPLAY, 'text-[28px]')}>Restaurant dashboard</h1>
          <p className="mt-1.5 text-[14px] text-ink-3">Sign in to work the pass, the menu and the numbers.</p>
        </div>

        <form
          className={cx(PANEL, 'grid gap-4 p-5')}
          onSubmit={(e) => {
            e.preventDefault();
            void submit(email, pin);
          }}
        >
          <Field label="Work email">
            <TextInput value={email} onChange={setEmail} type="email" placeholder="you@sekuwaghar.np" autoFocus />
          </Field>
          <Field label="PIN">
            <TextInput value={pin} onChange={setPin} type="password" maxLength={8} placeholder="••••" />
          </Field>

          {error && (
            <p role="alert" className="rounded-xl bg-berry/10 px-3.5 py-2.5 text-[13.5px] text-berry ring-1 ring-berry/25 ring-inset">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy || !email || !pin} className={cx(ADMIN_PRIMARY, 'h-12 w-full text-[15px]')}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
        </form>

        {!IS_LIVE_API && (
          <div className="mt-6">
            <p className="mb-2 text-center text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-4">
              Demo accounts · PIN {DEMO_PIN}
            </p>
            <div className="grid gap-2">
              {staffDirectory().map((member) => (
                <button
                  key={member.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void submit(member.email, DEMO_PIN)}
                  className={cx(
                    PANEL,
                    'flex items-center justify-between gap-3 px-4 py-3 text-left transition-move',
                    'active:scale-[0.99] disabled:opacity-50',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold">
                      {member.name} · {ROLE_LABEL[member.role]}
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">{ROLE_SCOPE[member.role]}</span>
                  </span>
                  <span className="shrink-0 text-[12.5px] font-semibold text-flame-1">Use</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-[13px] text-ink-4">
          <Link to="/" className="font-semibold text-ink-3 hover:text-ink">
            ← Back to the diner app
          </Link>
        </p>
      </div>
    </main>
  );
}
