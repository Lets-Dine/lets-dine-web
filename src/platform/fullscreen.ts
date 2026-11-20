/**
 * Full screen for POS mode. A browser only grants it from a real tap or click in that tab. Opening POS in a new tab
 * does not carry the click over, so the POS screen asks as it opens and again on the first tap or key there.
 * It is given back when POS closes, but only if POS was the one that took it: a screen someone put into full screen
 * themselves is left as they had it.
 */
type FullscreenDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const doc = () => document as FullscreenDoc;
export const isFullscreen = () => Boolean(doc().fullscreenElement ?? doc().webkitFullscreenElement);

let takenByPos = false;
// Leaving it some other way (Esc, the browser's own control) means POS no longer holds it.
if (typeof document !== 'undefined') {
  const sync = () => {
    if (!isFullscreen()) takenByPos = false;
  };
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
}

/** Call from a click or tap. Quietly does nothing where the browser cannot or will not (an iPhone, a blocked request). */
export async function enterFullscreen(): Promise<void> {
  if (typeof document === 'undefined' || isFullscreen()) return;
  const root = document.documentElement as FullscreenEl;
  try {
    if (root.requestFullscreen) await root.requestFullscreen();
    else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
    else return;
    takenByPos = true;
  } catch {
    /* refused: POS works the same without it */
  }
}

/** Gives full screen back, if POS took it. */
export async function exitFullscreenIfTaken(): Promise<void> {
  if (!takenByPos || !isFullscreen()) {
    takenByPos = false;
    return;
  }
  takenByPos = false;
  try {
    if (doc().exitFullscreen) await doc().exitFullscreen();
    else await doc().webkitExitFullscreen?.();
  } catch {
    /* already out */
  }
}

/** The header's manual switch. Whatever it turns on, POS gives back when it closes. */
export async function toggleFullscreen(): Promise<void> {
  if (isFullscreen()) {
    takenByPos = true;
    await exitFullscreenIfTaken();
  } else await enterFullscreen();
}
