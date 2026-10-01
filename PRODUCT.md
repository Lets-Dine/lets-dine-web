# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two primary audiences, both already served by the product:

- **Diners** — public, no account, mobile-first. Scan a table QR code, discover what's actually worth ordering, order it, track status, review it afterward.
- **Restaurant owners/staff** — laptop-first, run the menu, tables, orders, reviews, and analytics via the admin dashboard (`/admin`).

This surface (Getting Started / restaurant sign-up) adds a third moment for the restaurant-owner audience: the self-serve entry point where a prospective restaurant owner, arriving from the marketing site, decides to bring their restaurant onto the platform and creates the account that becomes their `/admin` login.

## Product Purpose

A restaurant dining platform that improves the in-restaurant experience by combining digital menus, dish-level ratings/reviews, verified diner feedback, dish discovery, table-aware QR ordering, restaurant order management, and restaurant analytics. Success for the owner-facing side is restaurants onboarding quickly and reaching their first working menu/table setup with minimal friction.

## Positioning

Not a generic QR-ordering system. Core claim: "A traditional menu tells a diner what dishes exist and how much they cost. This product tells them what's actually worth ordering." Ordering activity generates the verified-review dataset that powers recommendations — the long-term position is "the app that tells you what to eat." A restaurant owner signing up is buying into this discovery/recommendation loop, not just a QR-menu utility.

## Operating Context

- Diner flow: scan QR → discover dishes → evaluate via ratings/reviews → cart → order → status → review.
- Owner/staff flow: `/admin` dashboard — menu board, dish editor, tables/QR codes, orders, payments, reviews, analytics, staff, settings. PIN-based staff auth today.
- Internal operator flow: `/platform` is a key-gated internal console (not public) where an operator currently creates a restaurant + its first owner account in one combined form (`src/routes/platform/Restaurants.tsx`, `registerRestaurant` in `src/api/platform.ts`). This is today's only "restaurant signup," and it is explicitly not self-serve or public-safe.
- The marketing landing page (`src/routes/landing/`) today links its "Get started" CTA straight into that internal `/platform` console — a gap this new public Getting Started surface is meant to close.

## Capabilities and Constraints

- MVP scope: restaurants create/manage menus, create tables/QR codes, receive/manage orders, get basic analytics.
- Explicit non-goals: social network, marketplace/city-wide discovery, delivery, reservations, loyalty points, complex payments, native apps, AI-generated or anonymous reviews.
- This surface is **UI/UX only for now** — no backend/API wiring. It must capture, in the interface, both restaurant basics and a named owner user (name, email, phone number), mirroring the shape of the existing internal `registerRestaurant` flow but as a public, self-serve, multi-step experience rather than an internal key-gated form.
- Restaurant-side fields are intentionally minimal at sign-up (name + city/location); deeper setup (menu, tables, tax, currency, timezone) happens after signup inside `/admin`, not on this page.
- Decided build shape (confirmed with user): bold landing-page visual identity carried through the whole flow (not a plain utilitarian form); multi-step wizard (restaurant basics → owner info → confirm); minimal restaurant fields (name + city).

## Brand Commitments

- Typography: Fraunces (display/serif), Inter Tight (body), Space Mono (numerals/mono) — already loaded project-wide via `index.html`.
- Palette: warm, low-light "restaurant table" world — oklch-based board/paper/ink tokens, flame-orange accent family (`--color-flame-1/2/3`), gold/mint/berry/leaf secondary accents, dark surfaces (`--color-bg`, `--color-surface` family).
- Existing landing-page design kit (`src/routes/landing/kit.tsx`): `Band`, `Mark`, `SplitHeading`, `PrimaryCta`/`SecondaryCta` pill buttons, `Panel`/`PanelBar`, `Figure`. This surface inherits that system rather than inventing a new one.
- GSAP + Lenis power scroll-driven reveals/parallax on the marketing site; motion grammar should feel of a piece with it.

## Evidence on Hand

- `src/api/platform.ts` — `registerRestaurant(input)` shape: `{ name, slug, tagline?, description?, coverImageUrl?, currency?, timezone?, serviceChargeRate?, taxRate?, owner: { name, email, pin } }`. Real field names/validation (slug regex, PIN 4–8 digits) to reference, though the new public flow swaps PIN for phone number per this session's direction.
- `src/routes/platform/Restaurants.tsx` — working internal form; useful as a functional template, not a visual one (it uses the admin kit, not the landing kit).
- No existing public signup/register page anywhere in `src/routes/landing/` or elsewhere in `src/routes/`.

## Product Principles

- Discovery and recommendation are the product's real value; the owner-facing story should sell that loop, not just "digital menu software."
- Diner flows stay zero-friction/no-account; owner-facing flows (including this one) can ask for real information but should stay fast — this is a conversion surface, not a configuration surface.
- Deep setup (menu, tables, tax, currency) is deliberately deferred to post-signup `/admin` onboarding, keeping the public sign-up short.
- One shared warm/dark visual language spans diner app, admin dashboard, and marketing site; new public surfaces extend it rather than fragmenting it.
- UI/UX work ships ahead of backend wiring here; the interface should imply the real data shape (per `registerRestaurant`) so backend integration is a drop-in later, not a redesign.
