---
version: 1
slug: "src-routes-admin-delivery-tsx"
primary_target: "src/routes/admin/Delivery.tsx"
related_targets: ["src/routes/admin/CourierDetail.tsx"]
---

## Scope

`/admin/delivery` (partners as cards, riders as a list on one page), `/admin/delivery/partners/:id` and `/admin/delivery/riders/:id` (detail: config + transactions), inside the established admin world. Operate mode. Audience: branch manager / owner keeping the books at close of shift or when a partner statement arrives. Job: see who is out, who holds our cash, who we owe, settle it, and edit a courier's terms. Branch-scoped. No rider login. Mock-first (device storage) behind an async API shaped for a backend swap.

## Direction contract

THESIS: A courier is an account, not a pin on a map. The page is a settlement book where every courier carries one diverging balance line (they owe us / we owe them). Refuses the live-map dispatch board and the KPI-card dashboard.
OWN-WORLD: The admin world unchanged (surface/ink tokens, flame primary, Inter Tight UI, Fraunces headings). Money semantics: gold = a courier holds our cash, pass-blue = we owe the courier, ink-4 = settled; berry stays for errors only. One new atom, the Ledger Line: a hairline axis with a centre tick and a state-tinted bar growing left or right, scaled to the largest balance on the page. Partner cards use a tinted monogram tile; rider rows are plain hairline rows.
STORY: The manager sees who is on the road, sees who holds cash or is owed money, opens a courier, reads a running-balance statement, and records a settlement that zeroes the line.
FIRST VIEWPORT: Title with Add rider (primary) and Add partner (ghost); one status sentence (on the road, cash out, owed) with no cards; a Partners section of cards each ending in a Ledger Line; then a Riders panel with search and a Holding cash filter, rows ending in a compact Ledger Line.
FORM: Settlement book, extension of the admin surface; no concept roll (surface scope extension).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Built system notes

Everything resolves through incumbent admin tokens. Balance sign: positive = courier owes the branch (cash held minus fees earned).
