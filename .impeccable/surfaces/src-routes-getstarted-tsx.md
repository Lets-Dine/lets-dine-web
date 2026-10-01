---
version: 1
slug: "src-routes-getstarted-tsx"
primary_target: "src/routes/GetStarted.tsx"
related_targets: []
---

## Scope

Standalone public route `src/routes/GetStarted.tsx` (flat, same pattern as `src/routes/Landing.tsx`), mounted at `/get-started` in `src/App.tsx` alongside the `/` and `/demo` routes. Linked from the landing page's "Get started" CTAs (`src/routes/landing/Nav.tsx`, desktop line ~135 and mobile sheet line ~202, both currently `to="/platform"` — repointed to `/get-started` as part of this build). Persuade mode: a prospective restaurant owner decides to sign up and completes the self-serve wizard. UI/UX only this session — no backend wiring; the data shape mirrors `registerRestaurant` in `src/api/platform.ts` with PIN swapped for phone number.

Audience: a restaurant owner/manager arriving from the marketing site, evaluating whether to bring their restaurant onto the discovery/ordering platform.
Job: understand the offer fast, then complete a short 3-step sign-up (Restaurant basics → Owner info → Confirm) capturing restaurant name + city, and owner name, email, phone.
Constraints: must not feel like internal admin paperwork (the PIN-gated `/platform` form is explicitly the anti-reference); must stay fast — deep setup (menu, tables, tax, currency) is deferred to post-signup `/admin` onboarding.

## Direction contract

THESIS: A restaurant sign-up refuses to read as a form at all — it refuses the category default of a dense multi-field intake page by asking exactly one thing at a time, at full-bleed scale, so three short steps never accumulate into paperwork.

OWN-WORLD: Inherits the landing page's printed-paper identity exactly as `Landing.tsx` sets it — `data-page="landing"` flips the whole token set to cream stock and near-black ink for as long as the page is mounted (`--color-bg #f6f1e7`, ink `#171310`, printed chilli-red flame `#a4321c`/`#bc3b22`/`#8b2715`, gold `#b8862f`, warm-dark hairlines at low opacity). Fraunces carries every question headline, Inter Tight carries labels/body, Space Mono carries the step counter (the `label` utility in `index.css`). Printed `rule-t` hairlines, `rounded-[20px]` `Panel` chrome, `PrimaryCta` flame pill button with its arrow glyph — the same `landing/kit.tsx` this page already runs on. No dark board anywhere: that belongs to the admin/product app, not the marketing world this page extends. No eyebrow/kicker label above the question headline (banned by the craft floor regardless of world) — the step-dots carry sequence information on their own, the heading needs no label riding over it.

STORY: Visitor lands already convinced by the marketing site; this surface's job is just to not lose them. Each screen asks one question in large Fraunces display type, answers it, and advances with zero friction — reinforcing "this will be fast" with every transition. Final step is a confirm/review screen before a celebratory "you're in" moment that hands off toward `/admin`.

FIRST VIEWPORT: Full-bleed single-question stage on the cream paper ground. Three small step-dots (Restaurant / Owner / Confirm) centered at the very top, Space Mono label style, uppercase, tracked wide — the only wayfinding on screen, and load-bearing (not decorative). Centered column below: a large Fraunces question in near-black ink ("What's your restaurant called?"), a single pill-shaped input in a lightly tinted surface beneath it at display scale, and a flame-colored circular arrow button to advance, sitting beside the input. Nothing else on the ground — the cream stock texture (`bg-stock`) carries the whole screen.

FORM: "One Question At A Time" — assigned by the roll on the second deal (re-roll round 1) from a 7-candidate ranked list, where it ranked above a scroll-continuous hero-into-wizard and a conversational concierge-chat structure (both held as full alternates). Seed key `61dd3d5d`.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved decisions

- Exact grouping of fields per screen: strictly one field per screen (5 screens total) vs. pairing closely-related fields (e.g. owner email + phone together) to keep the flow to 3-4 screens. Resolved during build toward pairing within each of the 3 macro-steps, to respect the "fast" constraint.
- Whether `/get-started` is reachable only via a direct route, or also designed to be scrolled into from the landing page itself (the "Scroll Into The Story" alternate structure) — out of scope for this round; built as its own standalone route per the locked structure.
- Copy for the final confirm/handoff screen (what happens immediately after signup — redirect to `/admin` first-login, a "check your email" step, etc.) is UI-only placeholder since no backend exists yet.
