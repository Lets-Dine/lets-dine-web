import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearPlatformKey, readPlatformKey } from '../../api/platform';
import { AdminThemeToggle } from '../../state/AdminTheme';
import { DISPLAY, GLASS, cx } from '../../components/ui';

/**
 * Frame for the operator console. Auth is a shared key, not a staff account —
 * there is no restaurant yet when the first one is being created.
 */
export function PlatformLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  if (!readPlatformKey()) {
    return <Navigate to="/platform/signin" replace state={{ from: location.pathname }} />;
  }

  const signOut = () => {
    clearPlatformKey();
    navigate('/platform/signin', { replace: true });
  };

  return (
    <div className="min-h-dvh bg-bg lg:bg-room">
      <header className={cx('sticky top-0 z-40 border-b border-hairline', GLASS)}>
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pb-3 pt-[calc(10px+var(--safe-t))] sm:px-6 lg:px-8">
          <div className="min-w-0">
            <div className={cx(DISPLAY, 'truncate text-[22px] sm:text-[24px]')}>myfood</div>
            <div className="text-[12px] text-ink-4">Platform admin</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AdminThemeToggle />
            <button type="button" onClick={signOut} className="text-[13px] font-semibold text-ink-3 hover:text-ink">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
        <Outlet />
      </main>
    </div>
  );
}
