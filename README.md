# myfood

Both halves of the Restaurant Dining Experience Platform described in
`my_food_blueprint.md`:

- **The diner app** — scan the QR on the table, work out what is actually worth
  ordering, order it, watch it come, rate it afterwards.
- **The restaurant dashboard** (`/admin`) — work the pass, run the menu, print
  table codes, read the reviews and the numbers.

React + TypeScript + Vite + Tailwind v4. The diner side is mobile-first with no
account and no install; the dashboard is a tool for a whole shift, so it is
denser and laptop-first, but it shares the same palette, easings and API.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # rules · admin rules · diner flow · dashboard walk
npm run build
```

The app opens on a stand-in for the physical QR code. In production the diner
lands straight on `/r/:restaurantSlug/t/:tableToken` and never sees that screen.
`/admin` asks for a sign-in; three demo accounts, one per role, are listed on
that screen with their PIN.

## Talking to the real API

The diner screens read through `src/api/diner.ts`, which picks its source at
build time:

| `VITE_API_URL` | Source |
| --- | --- |
| set | the backend in `../lets-dine-backend` (`src/api/live.ts`) |
| unset | the in-browser stand-in (`src/api/client.ts`) — what `npm test` uses |

Wired to the backend so far: **the public menu** (`GET
/public/restaurants/:slug/menu`), **dish detail and its reviews** (`GET
/public/dishes/:id`, `…/reviews`) and **the table session** behind the QR
(`POST /public/sessions`, resumed via `GET /public/sessions/current`). The
session token is cached per restaurant+table in `localStorage`, so reopening the
tab mid-meal continues the same visit instead of starting a second one.

Still on the stand-in, whatever `VITE_API_URL` says: placing an order, order
status and submitting reviews. Adding to the cart works, but checkout will not
reach the real kitchen until those are moved across too.

```bash
cd ../lets-dine-backend
docker compose up -d db && npm run db:seed && npm run dev   # API on :3100
cd ../myfood && npm run dev                                 # reads .env
npm run test:live                                           # menu, rendered against the API
```

`.env` points at `http://localhost:3100/api/v1`. The entry screen at `/` stands
in for a printed QR code, and which table it opens follows the same switch: with
`VITE_API_URL` set it uses `VITE_DEMO_SLUG`/`VITE_DEMO_TABLE_TOKEN` (and says so
plainly if they are missing); with it unset it opens the stand-in's own demo
table and ignores those two entirely, so neither source is ever handed the
other's token. There is no public endpoint that hands out table tokens — that is
what makes a printed code a credential — so put a real one in `.env.local`:

```bash
docker exec lets-dine-db psql -U postgres -d lets_dine \
  -tAc "select name, qr_token from lets_dine.dining_tables order by sort_order"
```

See `.env.example` for both variables. `npm test` stays offline and needs none
of this.

## Diner screens

| Route | Screen |
| --- | --- |
| `/` | QR entry (demo only) |
| `/r/:slug/t/:token` | Restaurant menu — cover, search, categories, merchandising rails |
| `…/d/:dishId` | Dish detail — ratings, breakdown, tags, reviews, add to cart |
| `…/cart` | Cart — quantities, kitchen notes, bill |
| `…/checkout` | Confirm table, payment method, place order |
| `…/order/:orderId` | Live status timeline (polled) |
| `…/order/:orderId/review` | Post-meal rating flow |

## Restaurant screens

| Route | Screen |
| --- | --- |
| `/admin/signin` | Staff sign-in — demo accounts, one per role |
| `/admin` | Dashboard — today, the live pass, what needs attention |
| `/admin/orders` | The pass — tickets by stage, one next move each |
| `/admin/menu` | Menu — availability, staff picks, order, archive |
| `/admin/menu/:dishId` | Dish editor (`new` for a new one) |
| `/admin/categories` | Categories — rename, reorder, delete when empty |
| `/admin/tables` | Tables and their printable QR codes |
| `/admin/reviews` | Every verified review, filterable |
| `/admin/analytics` | Orders, revenue, dish performance, feedback |
| `/admin/settings` | Restaurant profile, fees, audit log |

## Layout

Phones are the common case, so every screen is designed at that width first and
then given room to breathe:

- **`sm`** — page gutters widen; rails still scroll horizontally.
- **`md`** — dish rows become two columns of self-contained cards.
- **`lg`** — the real desktop layout. Merchandising rails turn into four-up
  grids, the menu gains a sticky category sidebar, dish detail splits into a
  sticky photo beside its ratings, and cart / checkout / order-status put a
  sticky bill alongside the content. Fixed bottom action bars disappear —
  their controls move inline, where a mouse expects them — and the cart becomes
  a floating pill in the corner rather than a full-width thumb target.

`src/components/ui.ts` holds the shared layout rails (`WIDE`, `SPLIT`, button
and chip recipes) so those decisions live in one place instead of being retyped
per screen.

The dashboard inverts the emphasis. It is the same palette and the same easings
— same restaurant — but squarer, denser and led by numbers rather than
photographs, because it is looked at for a whole shift rather than for ninety
seconds. Below `lg` the sidebar becomes a scrolling tab strip under a compact
header, so a manager can still work the pass from a phone.
`src/components/admin/kit.tsx` holds its vocabulary.

## Styling

Tailwind v4, configured entirely in `src/index.css`. The palette, fonts,
shadows, easings and keyframes are `@theme` tokens, so `bg-surface`,
`text-flame-1`, `shadow-flame` and `animate-rise` are generated utilities rather
than magic strings. A handful of `@utility` definitions cover what utilities
cannot express on their own — the saffron→chili gradient, the shimmer for
skeletons, tabular figures, scrollbar hiding, and the two glass materials.

One of them exists to work around a footgun: Tailwind v4 emits `scale-*`,
`translate-*` and `rotate-*` as their own CSS properties instead of folding them
into `transform`, so `transition-transform active:scale-95` transitions nothing
and the press just snaps. **`transition-move`** names the correct property list
once; every press, hover and settle uses it.

## Feel

Response is the foundation — an interface that lags stops feeling direct — so
feedback lands on pointer-*down*, never on release, and continues during the
gesture rather than only at its end.

- **Materials.** `glass` (bars) and `glass-chip` (floating controls) are
  translucent layers that content scrolls *under*. Bigger surfaces read as
  thicker glass. Defined once in CSS so the accessibility fallbacks have a
  single pair of selectors to override.
- **Direct manipulation.** The star picker tracks the finger across the whole
  row with a tick at each step, so a diner feels their way to a rating instead
  of aiming at one. `touch-action: pan-y` keeps the page scrollable from there.
- **Haptics** (`src/platform/haptics.ts`) fire on the causal event, on the same
  frame as the visual, and only where they earn it: a step, a commit, a
  completion, a refusal. The Vibration API is a no-op on iOS Safari — nothing
  here depends on it.
- **Motion has a return path.** Toasts leave the way they arrived (`sink`
  mirrors `pop`) rather than vanishing.

## Forgiveness and confirmation

Reversible things get an undo, not a warning; irreversible ones get the warning.

- Adding a dish and removing a cart line both raise a toast carrying **Undo**.
  Restoring a removed line puts it back at its original index, so undo is a true
  reversal rather than a re-add at the bottom.
- **Cancelling an order** is the one thing that cannot be undone, so it is the
  one thing that asks twice — inline, in place of the button, with the safe
  answer leading. No dialog to dismiss.

The dashboard keeps the same bargain. Taking a dish off the menu is one tap and
reversible, so it just happens; archiving a dish, deleting a category,
cancelling a ticket and regenerating a printed QR ask in place, with the safe
answer first. A refusal from the API is always shown — the server owns the
rules, so its reason is the one worth reading.

## Accessibility

- **Contrast.** The two quietest inks carried 11–13px text at ~3:1. They now
  clear 4.5:1 on both `bg` and `surface` while keeping their place in the
  hierarchy.
- **`prefers-reduced-motion`** replaces travel with a cross-fade instead of
  disabling feedback wholesale — journeys and looping oscillation go, the press
  response that tells you a tap landed stays.
- **`prefers-reduced-transparency`** and **`prefers-contrast`** make the glass
  solid, the second adding a defined border and lifting the quiet inks again.
  These blocks are deliberately unlayered so they beat Tailwind's utilities.
- **Navigation moves focus** to the new screen's `<main>`, and search announces
  its result count through a live region that is always mounted.
- The star picker is one tab stop with a roving tabindex; arrows, Home and End
  move within it.

## Returning to where you were

`App.tsx` remembers scroll position per history entry. A new screen starts at
the top; a **back** navigation restores the exact offset, instantly — a diner
who scrolls deep into the menu, opens a dish and comes back must not pay for
the scroll again. Smooth scrolling is for jumps the diner asked for.

## Where the rules live

There is no backend yet. `src/api/` is a mock that holds every rule the real
server must own, so replacing it with `fetch` calls is the only change the UI
needs. `store.ts` is the shared table both halves read and write; `client.ts` is
the diner's endpoints and `admin.ts` the restaurant's.

- prices and availability are read from the server's own menu, never from the client
- totals are recalculated server-side; the client's arithmetic is display only
- an idempotency key makes a retried submission return the original order
- orders snapshot dish name and unit price, so a later price change cannot rewrite history
- a review requires a **completed** order that actually contained the dish, once per dish per order
- every dashboard mutation checks the actor's role and writes an audit entry
- an order only ever advances one step, and only from the status the caller last saw

Money is an integer count of minor units everywhere (`src/domain/money.ts`).
No floating point touches a total.

## The two halves share one store

That is the part worth pointing at. The dashboard is not a mock beside the
diner app — it writes to the same place, so:

- marking a dish unavailable stops the very next order for it, with a 409
- a price change applies to the next order placed and to nothing already placed
- archiving a dish removes it from the diner menu while its order history keeps
  the name and price those diners actually paid
- disabling a table stops its QR resolving; regenerating a token voids the
  printed card immediately
- a service-charge change reaches carts that are already open

Each of those is a check in `npm run test:admin`, because a dashboard that
edits its own private copy of the menu is a screenshot, not a feature.

## Roles and the audit log

Three roles (§50), checked twice. The dashboard hides what a person cannot use
— navigation is filtered, not disabled — and `api/admin.ts` refuses it again if
the call arrives anyway.

| | Orders | Menu | Tables · Reviews · Analytics | Fees |
| --- | --- | --- | --- | --- |
| **Staff** | work the queue | read | — | — |
| **Manager** | + cancel | edit, price, archive | yes | — |
| **Owner** | ✓ | ✓ | ✓ | yes |

Price changes, availability, archiving, category and table edits, token
rotation and every order transition are written to an audit log (§51) with the
person who did it and the before/after — readable at the bottom of Settings.

## The QR codes are real QR codes

`src/domain/qr.ts` is a self-contained encoder: Reed–Solomon over GF(256),
mask selection by penalty score, BCH format and version bits, byte and numeric
modes, levels L–H, versions 1–10. No dependency, and it emits an SVG path, so
printing a floor's worth of codes is a print dialog rather than an image
pipeline. Table cards use level Q, because they get laminated and then spend a
year collecting fingerprints.

Its output is checked against the worked example in ISO/IEC 18004 Annex I —
data codewords and error-correction codewords, byte for byte. A code that
merely looks like a QR would be worse than none at all.

The printed code carries the restaurant slug and an opaque table token and
nothing else (§53): no menu, no prices, no session. The backend resolves the
current state on scan, which is what makes the code safe to laminate.

## Ranking and merchandising

`src/domain/metrics.ts` ranks dishes with a Bayesian-adjusted rating so a 5.0
from two diners cannot outrank a 4.8 from five hundred. Popularity,
recommendation rate and recent order velocity are blended in with replaceable
weights. Thresholds live in `src/domain/config.ts`, not in components.

"Most loved", "Trending", "Hidden gems" and "Best value" are computed views over
the menu, not stored entities.

Dishes with no ratings say *"Be the first to rate this dish"*. Nothing is
fabricated, and a rating is never shown without its count.

## Where the numbers come from

A restaurant that opened this morning has nothing to analyse, so
`src/data/history.ts` reconstructs the last ninety days from the same dish
statistics the diner side merchandises on: a dish with 480 orders in the
trailing month gets roughly 480 orders in the history, and one whose velocity
doubled shows that shape week over week. Analytics and the menu therefore tell
the same story rather than two unrelated ones.

It is deterministic and keyed to the calendar day, so the figures hold still
while a manager reads them, and it is never persisted — only today's orders are
written to the store.

`src/domain/adminMetrics.ts` computes everything on top of that. Every headline
figure is compared against the same window immediately before it: "Rs. 84,200
this week" says nothing, and "up 12% on last week" is a decision.

## The demo kitchen

The diner flow has to work with nobody at the pass, so orders placed from this
browser's diner app advance on a timer. Orders sitting on the restaurant queue
never do — they move when staff move them, or the timer would keep completing
tickets nobody has cooked. Settings has a switch for the timer; it is labelled
as a demo control, because it is one.

## Tests

`npm test` runs four headless suites, no browser required:

- **`test:rules`** — order totals, price snapshots, idempotency, availability,
  and the full review-eligibility chain, straight against the API client.
- **`test:admin`** — the QR encoder against the ISO vectors, role enforcement,
  the queue's state machine including the stale-transition conflict, the audit
  trail, and every way a dashboard edit is supposed to reach the diner.
- **`test:flow`** — mounts the real app in jsdom and walks the whole funnel:
  scan → menu → dish → cart → checkout → order → completion → rating submitted.
- **`test:dashboard`** — signs in as staff, checks the navigation is genuinely
  filtered, signs in again as a manager and walks all nine screens, accepting a
  ticket and taking a dish off the menu on the way through.

The rendering suites earn their keep: the first caught a redirect race that sent
diners to an empty cart instead of the order they had just placed.

## Not built here

Platform admin (the multi-restaurant, cross-tenant console), real staff
authentication, payments beyond selecting a method, and restaurant replies to
reviews. Notifications are a toast rather than a push.
