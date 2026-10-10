import { useEffect } from 'react';

/**
 * While a sheet or modal is open, the browser's back button does nothing: it pushes a history entry of
 * its own and puts it back whenever it is popped, so the page behind cannot be left by accident with
 * a half-filled form. Closing drops that entry again. The copied state keeps the router's
 * own bookkeeping intact.
 */
export function useDiscardBack() {
  useEffect(() => {
    const hold = () => window.history.pushState(window.history.state, '');
    hold();
    window.addEventListener('popstate', hold);
    return () => {
      window.removeEventListener('popstate', hold);
      window.history.back();
    };
  }, []);
}
