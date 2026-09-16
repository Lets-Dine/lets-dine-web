/**
 * The diner menu, rendered against the real backend rather than the in-browser
 * stand-in.
 *
 *   cd ../lets-dine-backend && docker compose up -d db && npm run db:seed && npm run dev
 *   cd ../myfood && npm run test:live
 *
 * Unlike `npm test`, this one needs the API up on VITE_API_URL and the seeded
 * demo restaurant behind it — the checks below name that seed data on purpose,
 * because the point is that what renders came over the wire.
 */
import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';

let failures = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};

async function settle(ms = 600) {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, ms / 4));
    });
  }
}

const text = () => document.body.textContent ?? '';
const link = (label: string) => [...document.querySelectorAll('a')].find((a) => (a.textContent ?? '').includes(label));
const click = async (el: Element | undefined, wait = 900) => {
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

// ── QR entry → menu ─────────────────────────────────────────────────
await click(link('Open the menu'), 1200);

check('Menu renders the seeded restaurant', text().includes('Newa Kitchen'));
check('Tagline comes from the API', text().includes('Kathmandu classics, cooked to order'));
check('Seeded categories render', text().includes('From the grill') && text().includes('Momo'));
check('Seeded dishes render', text().includes('Chicken Sekuwa') && text().includes('Buff Steam Momo'));
check('Prices are formatted from minor units', text().includes('450'), 'Chicken Sekuwa is 45000 paisa');
check('The table behind the QR is named', /T1|T2|T3|Window/.test(text()));
check('No stand-in data leaked in', !text().includes('Sekuwa Ghar'));

const sessions = Object.keys(localStorage).filter((k) => k.startsWith('myfood.session.'));
check('A table session was opened and cached', sessions.length === 1, sessions[0]);

// ── Dish detail ─────────────────────────────────────────────────────
const dishLink = [...document.querySelectorAll('a')].find((a) => (a.getAttribute('href') ?? '').includes('/d/'));
check('Dish tiles link by the API id', /\/d\/[0-9a-f]{8}-[0-9a-f]{4}-/.test(dishLink?.getAttribute('href') ?? ''));

await click(dishLink, 1200);
check('Dish detail loads from the API', text().includes('Add ·'));

console.log(failures === 0 ? '\nAll live checks passed' : `\n${failures} live check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
