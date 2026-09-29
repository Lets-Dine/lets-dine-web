/**
 * The pass's own alert — a new ticket landing while nobody is looking at the
 * screen still needs to be heard. One sound, one meaning: an order just came in.
 */

let newOrderAudio: HTMLAudioElement | null = null;

export function playNewOrderSound(): void {
  if (typeof Audio === 'undefined') return;
  try {
    newOrderAudio ??= new Audio('/sounds/new-order-2.mp3');
    newOrderAudio.currentTime = 0;
    void newOrderAudio.play().catch(() => {
      /* autoplay blocked — no user gesture on this tab yet */
    });
  } catch {
    /* unsupported or blocked */
  }
}
