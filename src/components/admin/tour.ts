import { driver } from 'driver.js';
import type { DriveStep, Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import type { OnboardingStepKey } from '../../api/onboarding';

interface Stop {
  /** The `data-tour` value on the element to point at. */
  target: string;
  title: string;
  body: string;
  /** Pointed at instead when the target is not on the page (no tables yet, so no QR code to show). */
  orElse?: Stop;
}

/** The page each checklist step is done on, and the elements worth pointing at there. */
export const TOURS: Record<OnboardingStepKey, { path: string; stops: Stop[] }> = {
  brand: {
    path: '/admin/settings?tab=branding',
    stops: [
      { target: 'logo', title: 'Your logo', body: 'Click Upload logo, pick a square image and crop it. Guests see it at the top of your menu. Then press Next.' },
      { target: 'save-settings', title: 'Now save it', body: 'The upload is not kept until you click Save changes. The button lights up once there is something to save.' },
    ],
  },
  fees: {
    path: '/admin/settings?tab=charges',
    stops: [
      { target: 'charges', title: 'Service charge and tax', body: 'Enter them as percentages. They are added to every order automatically. Leave both at 0 if you charge neither.' },
      { target: 'save-settings', title: 'Save your changes', body: 'Click Save changes to keep them.' },
    ],
  },
  categories: {
    path: '/admin/categories',
    stops: [{ target: 'add-category', title: 'Add a category', body: 'Type a name (Starters, Mains, Drinks…), then press Add category. Create a few before adding dishes.' }],
  },
  dishes: {
    path: '/admin/menu',
    stops: [{ target: 'add-dish', title: 'Add a dish', body: 'A name, a category, a price and a photo is enough to start. You can refine it later.' }],
  },
  tables: {
    path: '/admin/tables',
    stops: [
      { target: 'add-table', title: 'Add a table', body: 'Name it the way your staff call it, like "T1" or "Window 2".' },
      { target: 'table-qr', title: 'Its QR code', body: 'Print this and put it on the table. Guests scan it to order.' },
    ],
  },
  staff: {
    path: '/admin/staff',
    stops: [
      { target: 'staff-role', title: 'Pick a role', body: 'Roles decide what each person can see and change. Servers and cooks get the pass; managers also edit the menu.' },
      { target: 'add-staff', title: 'Add to the team', body: 'They sign in with their own email and PIN.' },
    ],
  },
  'first-order': {
    path: '/admin/tables',
    stops: [
      {
        target: 'table-qr',
        title: 'Try it yourself',
        body: 'Open a table QR on your phone, order something, then watch it land on the pass.',
        orElse: { target: 'add-table', title: 'Add a table first', body: 'Every table gets its own QR code. Add one, then come back to try an order.' },
      },
    ],
  },
};

/** How long to wait for a page's data to render its targets before giving up. */
const GIVE_UP_MS = 2500;
/** Pages fade their content in over a few hundred ms; measuring before that puts the spotlight a few pixels off. */
const SETTLE_MS = 800;

let active: Driver | null = null;
let cancelPoll = () => {};
let release = () => {};

/** Ends any tour on screen or still waiting for its page. Safe to call when there is none. */
export function stopTour() {
  cancelPoll();
  release();
  active?.destroy();
  active = null;
}

/**
 * driver.js traps Tab inside its popover and only knows a few input types (not an untyped or email field, not a
 * dialog a step opens). Its handler cannot be switched off, so Tab is stopped before it gets there and the
 * browser's own focus order applies. The spotlight is also re-measured when the pointed-at element resizes.
 */
function loosen(el: Element | undefined) {
  release();
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Tab') e.stopPropagation();
  };
  window.addEventListener('keydown', onKey, true);
  const observer = new ResizeObserver(() => active?.refresh());
  if (el) observer.observe(el);
  release = () => {
    window.removeEventListener('keydown', onKey, true);
    observer.disconnect();
    release = () => {};
  };
}

const find = (target: string) => document.querySelector(`[data-tour="${target}"]`);

/** Starts a step's tour once its page has rendered the targets; they may mount after data loads. */
export function startTour(key: OnboardingStepKey) {
  stopTour();
  const began = Date.now();
  let foundAt = 0;
  let frame = 0;
  cancelPoll = () => cancelAnimationFrame(frame);

  const attempt = () => {
    const now = Date.now();
    const anyHere = TOURS[key].stops.some((s) => find(s.target) || (s.orElse && find(s.orElse.target)));
    if (anyHere && !foundAt) foundAt = now;

    if (!foundAt) {
      if (now - began < GIVE_UP_MS) frame = requestAnimationFrame(attempt);
      return;
    }
    if (now - foundAt < SETTLE_MS) {
      frame = requestAnimationFrame(attempt);
      return;
    }

    const steps: DriveStep[] = [];
    for (const stop of TOURS[key].stops) {
      const use = find(stop.target) ? stop : stop.orElse && find(stop.orElse.target) ? stop.orElse : null;
      if (use) steps.push({ element: `[data-tour="${use.target}"]`, popover: { title: use.title, description: use.body } });
    }
    active = driver({
      showProgress: steps.length > 1,
      allowClose: true,
      // Arrow keys belong to the fields being pointed at.
      allowKeyboardControl: false,
      animate: true,
      smoothScroll: true,
      overlayOpacity: 0.55,
      stagePadding: 6,
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Got it',
      onHighlightStarted: (el) => loosen(el),
      onDestroyed: () => {
        release();
        active = null;
      },
      steps,
    });
    active.drive();
  };

  frame = requestAnimationFrame(attempt);
}
