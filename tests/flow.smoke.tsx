/**
 * End-to-end walk through the diner flow, rendered in jsdom.
 *
 *   npm run test:flow
 *
 * Covers what the rule tests cannot: that the screens actually mount, that the
 * funnel is navigable start to finish, and that state survives each hop.
 */
import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { STORE_KEY } from '../src/api/store';

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
}

/** Flushes pending effects, timers and the microtask queue a few times over. */
async function settle(ms = 400) {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, ms / 3));
    });
  }
}

const text = () => document.body.textContent ?? '';
const button = (label: string) =>
  [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim().includes(label));
const link = (label: string) =>
  [...document.querySelectorAll('a')].find((a) => (a.textContent ?? '').includes(label));
const click = async (el: Element | undefined, wait = 500) => {
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle(wait);
};

const container = document.createElement('div');
container.id = 'root';
document.body.appendChild(container);

await act(async () => {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
await settle();

// ── QR entry ────────────────────────────────────────────────────────
check('Entry screen renders', text().includes('Stop guessing'));
check('Entry names the restaurant', text().includes('Sekuwa Ghar'));

// ── Menu ────────────────────────────────────────────────────────────
await click(link('Open the menu'), 700);
check('Menu loads the restaurant', text().includes('Charcoal grill'));
check('Table context is shown', text().includes('Table 12'));
check('Most loved rail renders', text().includes('Most loved here'));
check('Hidden gems rail renders', text().includes('Hidden gems'));
check('Categories render', text().includes('Sekuwa & Grills'));
check('Dish shows its rating', text().includes('Chicken Sekuwa') && text().includes('4.8'));
check('Unrated dish avoids a fake zero', text().includes('Not rated yet') && !text().includes('⭐ 0'));
check('Unavailable dish is marked sold out', text().includes('Sold out'));
check('Desktop category nav is present', document.querySelectorAll('nav[aria-label="Menu categories"]').length === 1);

// ── Quick add from a card ───────────────────────────────────────────
const quickAdd = [...document.querySelectorAll('button')].find((b) =>
  (b.getAttribute('aria-label') ?? '').startsWith('Add '),
);
check('Cards expose a quick-add control', Boolean(quickAdd));
await click(quickAdd);
check('Cart dock appears once something is in the cart', text().includes('View cart'));
check('Adding confirms with a toast', text().includes('added'));

// ── Dish detail ─────────────────────────────────────────────────────
await click(link('Buff Jhol Momo'), 700);
check('Dish detail renders', text().includes('Buff Jhol Momo'));
check('Detail shows verified rating count', /verified ratings/.test(text()));
check('Detail shows the recommendation rate', text().includes('would order again'));
check('Detail shows review tags', text().includes('People often say'));
check('Detail shows verified reviews', text().includes('Verified diner'));
await click(button('Add ·'), 600);

// ── Cart → checkout ─────────────────────────────────────────────────
await click(link('View cart'));
check('Cart shows the bill breakdown', text().includes('Service charge') && text().includes('VAT'));
await click(button('Review & order'));
check('Checkout confirms the table', text().includes('Serving to'));
check('Checkout offers pay-at-restaurant', text().includes('Cash at the table'));

// ── Order status ────────────────────────────────────────────────────
await click(button('Place order'), 900);
const orderPath = window.location.pathname;
check('Placing an order lands on the order screen', orderPath.includes('/order/'), orderPath);
check('Status timeline renders', text().includes('Order placed') && text().includes('Preparing'));
check('Order shows locked-in unit prices', text().includes('each'));
check('Order reference is shown', /Order #\d+/.test(text()));
check('Review prompt stays hidden until completion', !text().includes('How was your meal?'));

await click(button('Back to the menu'), 700);
check('Menu keeps a live order tracker', /Order #\d+/.test(text()) && text().includes('Sent to the kitchen'));
const tracker = [...document.querySelectorAll('a')].find((a) => /Order #\d+/.test(a.textContent ?? ''));
check('Order tracker links back to the ticket', Boolean(tracker));
await click(tracker, 700);
check('Tracker returns to the order screen', window.location.pathname.includes('/order/'));

// Fast-forward the demo kitchen instead of waiting out the timeline.
const raw = JSON.parse(localStorage.getItem(STORE_KEY)!);
raw.orders = raw.orders.map((o: { createdAt: string }) => ({
  ...o,
  createdAt: new Date(Date.now() - 600_000).toISOString(),
}));
localStorage.setItem(STORE_KEY, JSON.stringify(raw));
await settle(3200);

check('Order reaches completion', text().includes('Completed'));
check('Review prompt appears once completed', text().includes('How was your meal?'));
check('Rate this meal is a primary action', Boolean(link('Rate this meal')));

await click(button('Back to the menu'), 700);
check('Menu reminds the diner to rate', text().includes('How was your meal?') && text().includes('Rate it when you are done'));
await click(link('How was your meal?'), 700);
check('Reminder opens the review flow', window.location.pathname.includes('/review'));
check('Review flow opens on the first dish', text().includes('You ordered'));
check('Rating starts empty', text().includes('Tap to rate'));

const fiveStars = [...document.querySelectorAll('button[role="radio"]')].filter(
  (b) => b.getAttribute('aria-label') === '5 of 5',
);
await click(fiveStars[0], 300);
check('Picking a rating reveals the detail questions', text().includes('Would you order it again?'));
check('Verdict label responds to the rating', text().includes('Excellent'));
check('Predefined tags are offered', text().includes('Great presentation'));

await click(button('Next dish'), 400);
const nextFive = [...document.querySelectorAll('button[role="radio"]')].filter(
  (b) => b.getAttribute('aria-label') === '5 of 5',
);
await click(nextFive[0], 300);
await click(button('Submit ratings'), 900);

check('Submitting confirms the ratings are live', text().includes('Your ratings are live'));
check('Confirmation counts the verified ratings', /2 verified ratings/.test(text()));

// ── Back to the menu, with the new rating folded in ─────────────────
await click(link('Back to the menu'), 900);
check('Menu still renders after the round trip', text().includes('Most loved here'));

console.log(failures === 0 ? '\nAll flow checks passed.' : `\n${failures} flow check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
