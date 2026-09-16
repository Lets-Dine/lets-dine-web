/**
 * Haptics.
 *
 * Three rules govern every call here (Apple, *Designing Audio-Haptic
 * Experiences*):
 *
 * - **Causality** — fire on the event that causes the change, never on a timer
 *   or an animation callback, so the touch is unmistakably *about* that thing.
 * - **Harmony** — fire on the same frame as the visual, so the two senses agree.
 *   A haptic that trails its animation reads as a glitch.
 * - **Utility** — reserved for moments that carry meaning: a commit, a step, a
 *   completion, a refusal. Buzzing on everything teaches people to ignore it.
 *
 * The Vibration API is a no-op on iOS Safari, so this is progressive
 * enhancement: the interface must be complete without it.
 */

type Pattern = number | number[];

/** Light tick — a discrete step happened (quantity ±1, a star selected). */
const TICK: Pattern = 8;
/** A choice landed and stuck (chip, payment method, tag). */
const SELECT: Pattern = 12;
/** Something is now in the cart / on its way — a real commit. */
const COMMIT: Pattern = [0, 13, 38, 20];
/** The end of a flow: order placed, ratings live. */
const SUCCESS: Pattern = [0, 15, 45, 15, 45, 28];
/** Refusal or destruction — deliberately coarser than everything above. */
const WARN: Pattern = [0, 22, 55, 22];

function fire(pattern: Pattern): void {
  if (typeof navigator === 'undefined') return;
  const vibrate = navigator.vibrate?.bind(navigator);
  if (!vibrate) return;
  try {
    vibrate(pattern);
  } catch {
    /* Blocked by the platform (no user gesture yet, or the tab is hidden). */
  }
}

export const haptic = {
  tick: () => fire(TICK),
  select: () => fire(SELECT),
  commit: () => fire(COMMIT),
  success: () => fire(SUCCESS),
  warn: () => fire(WARN),
};
