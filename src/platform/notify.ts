/**
 * OS notifications for when the diner has left the tab — the in-app toast
 * already covers the case where they are looking at the menu.
 *
 * Permission is requested once, after an order is actually placed, so a
 * first-time visitor is not interrupted before they have anything to hear.
 */

export function requestNotifyPermission(): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'default') return;
  void Notification.requestPermission().catch(() => {
    /* denied or unsupported — the in-app toast still fires */
  });
}

export function notifyAway(title: string, body: string, tag: string): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  try {
    new Notification(title, { body, tag, silent: false });
  } catch {
    /* Safari private mode, missing service worker, etc. */
  }
}
