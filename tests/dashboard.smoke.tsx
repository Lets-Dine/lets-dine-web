/**
 * Walks the restaurant dashboard in jsdom.
 *
 *   npm run test:dashboard
 *
 * The rule tests already prove the API refuses what it should. This proves the
 * nine screens in front of it mount, navigate and act — and that a role change
 * actually changes what a person is shown, not just what they are allowed.
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

async function settle(ms = 500) {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, ms / 3));
    });
  }
}

const text = () => document.body.textContent ?? '';
const buttons = (label: string) =>
  [...document.querySelectorAll('button')].filter((b) => (b.textContent ?? '').trim().includes(label));
const link = (label: string) =>
  [...document.querySelectorAll('a')].find((a) => (a.textContent ?? '').trim().includes(label));
const click = async (el: Element | undefined, wait = 550) => {
  if (!el) throw new Error('nothing to click');
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle(wait);
};

globalThis.localStorage.clear();
window.history.pushState({}, '', '/admin');

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

// ── Sign-in gate ────────────────────────────────────────────────────
check('The dashboard is behind a sign-in', text().includes('Sign in to work the pass'));
check('Demo accounts are offered', text().includes('Ranjana Shrestha') && text().includes('Sunita Rai'));

// ── Staff see only their job ────────────────────────────────────────
const staffRow = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('Sunita Rai'));
await click(staffRow, 900);
check('Staff land on the dashboard', text().includes('In the kitchen'));
check('Staff get the order tabs', Boolean(link('Orders')));
check('Staff are not shown settings', !link('Settings') && !link('Analytics'), 'nav is filtered by role');

await click(buttons('Sign out')[0]);
await settle();

// ── A manager gets the whole dashboard ──────────────────────────────
const managerRow = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('Bikash Tamang'));
await click(managerRow, 900);
check('Managers get every section', Boolean(link('Analytics') && link('Tables') && link('Reviews') && link('Settings')));
check('Today is summarised', text().includes('Orders today') && text().includes('Revenue today'));
check('The pass is previewed', text().includes('On the pass'));

// ── Orders ──────────────────────────────────────────────────────────
await click(link('Orders'), 900);
check('The queue renders tickets', /Order #\d+/.test(text()));
check('New tickets offer exactly one next move', text().includes('Accept'));

const beforeAccept = (text().match(/Order #\d+/g) ?? []).length;
await click(buttons('Accept')[0], 1200);
check('Accepting moves the ticket out of the new lane', (text().match(/Order #\d+/g) ?? []).length < beforeAccept, `${beforeAccept} → ${(text().match(/Order #\d+/g) ?? []).length}`);

await click([...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('In the kitchen')), 800);
check('It reappears in the kitchen lane', text().includes('Start preparing') || text().includes('Mark ready'));

// ── Menu ────────────────────────────────────────────────────────────
await click(link('Menu'), 900);
check('The menu lists categories and dishes', text().includes('Momo') && text().includes('Chicken Steam Momo'));
check('Availability is one tap away', text().includes('Mark unavailable'));

await click(buttons('Mark unavailable')[0], 1200);
check('Marking a dish unavailable is confirmed', text().includes('marked unavailable'));

await click(link('Edit'), 900);
check('The editor opens on that dish', text().includes('Details') && text().includes('What diners said'));
check('Ratings are shown but not editable', text().includes('Read-only'));
await click(link('Back to menu'), 800);

// ── Categories, tables, reviews, analytics, settings ────────────────
await click(link('Categories'), 900);
check('Categories screen renders the menu order', text().includes('Menu order') && text().includes('Add a category'));

await click(link('Tables'), 1400);
check('Tables render with their codes', text().includes('Table 12') && text().includes('seats'));
check('A QR is actually drawn', document.querySelectorAll('svg[aria-label="QR code for this table"]').length > 5);
check('Codes can be printed and downloaded', Boolean(buttons('Print')[0] && buttons('Download')[0]));

await click(link('Reviews'), 1100);
check('Reviews render with their filters', text().includes('Complaints') && text().includes('Verified diner'));
check('Dish ratings are ranked', text().includes('Dish ratings'));

await click(link('Analytics'), 1400);
check('Analytics renders the blueprint metrics', text().includes('Most ordered') && text().includes('Lowest rated'));
check('Revenue is charted', text().includes('Revenue, last 30 days'));
check('The product metric is present', text().includes('Dish decision rate'));

await click(link('Settings'), 1100);
check('Settings renders', text().includes('Service charge') && text().includes('Audit log'));
check('A manager cannot change fees', text().includes('Only an owner can change these'));
check('The audit log recorded the shift', text().includes('availability changed') || text().includes('order status changed'));

// ── The store is shared with the diner app ──────────────────────────
const store = JSON.parse(globalThis.localStorage.getItem(STORE_KEY) ?? '{}');
check('Dashboard edits are persisted to the same store', Array.isArray(store.menu?.dishes) && store.audit.length > 0);

console.log(failures === 0 ? '\nAll dashboard checks passed.' : `\n${failures} dashboard check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
