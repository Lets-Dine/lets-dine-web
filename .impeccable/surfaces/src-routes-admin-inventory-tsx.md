---
version: 1
slug: "src-routes-admin-inventory-tsx"
primary_target: "src/routes/admin/Inventory.tsx"
related_targets: []
---

## Scope

`/admin/inventory` (Stock), inside the established admin dashboard world. Operate mode. Audience: owner/manager or kitchen lead mid-shift or at the morning delivery. Job: see at a glance what is empty or low, restock it, correct a wrong count, send stock to a branch, add an ingredient. Same data, actions and copy voice as before; new structure.

## Direction contract

THESIS: Stock is a shelf of jars and each jar's fill IS the reading. Refuses the row-list-with-status-badges and the summary-card-on-top dashboard.
OWN-WORLD: The admin world unchanged (surface/ink tokens, flame primary, berry/gold/mint state, Inter Tight UI, Fraunces only for headings). New atom: the jar tile, a tall rounded tile whose state-tinted fill rises from the bottom with a solid meniscus, and one dashed warning line at half height on every jar.
STORY: The owner sees empty and low jars first, sees who sits under the line, presses + on a jar to log a delivery, and watches the fill rise.
FIRST VIEWPORT: Title and actions; a one-line status sentence with count and nudge chips (no card); filter + search; then shelves of jars in an auto-fill grid with warning lines aligned across each row. Restock is a + on each empty/low jar; Add ingredient is the page's only filled button.
FORM: Pantry Shelf, position 4 on the ordered list, seed key 61989bb3.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Built system notes

Surface-local atoms; no new tokens. Everything resolves through the incumbent admin tokens, so both admin themes work unchanged.

- **Jar tile**: fixed height `--jar` (236px, 252px from `sm`), `rounded-[22px]`, `bg-surface`, inset `ring-hairline` (`ring-berry/40` when out). Three stacked parts. **Lid** (62px): name 15px semibold + 12px caption, state-ink caption when out/low (`berry-ink` / `gold-ink`), `ink-3` when ok. **Glass** (flex-1, clipped): the fill. **Foot** (54px): the quantity as a bold number and a quiet unit (24px). Lid and foot are separated from the glass by hairlines so no level ever crosses text. Hover lifts 2px to `shadow-lift`; focus ring is `flame-2/60`.
- **Fill**: a full-size layer moved by `translate3d` (never by height), tint = state token (`berry` / `gold` / `mint`) at 30% via `color-mix(in oklab)`, a 2px solid top border in the same token as the meniscus. With no warning level the tint falls back to `ink-4` at 10%. Transform, colour and border transition together over 900ms `ease-out-quart`; first appearance rises from empty once per session.
- **Warning line**: one dashed 1px `ink/30` rule at exactly half height on every measured jar, because fill = quantity / (2 x warning level). Equal jar heights make the lines align across a row; the legend reuses the same dash (`ink/40`).
- **Out state**: glass washed `berry/6%` with a 4px `berry/70` floor bar; the + restock button (36px, round, `bg-surface`, hairline ring, flame glyph, fills `bg-flame` on hover) sits in the foot on out/low jars only.
- **Shelf and ledge**: auto-fill grid `minmax(150px, 1fr)`, gap-y 20px, 14px foot padding per jar; a repeating gradient band (`ink` at 9%, 5px) drawn under every row with period `--jar + 34px`. The period is coupled to gap-y and the 14px padding; change one and the ledge must change with it.
- **Held-slot pour**: after an action, the jar keeps its old section and sort slot for 1.5s while the fill transitions, the count tweens over 520ms (cubic ease-out), and `animate-flash` washes the glass in the outcome tint via `--flash-color`. Then the shelf re-sorts.
- **Sheet**: native `<dialog>` with class `.sheet` (index.css). Phones: bottom sheet `rounded-t-3xl`, `max-h-92dvh`, enters `sheet-up` 340ms / leaves `sheet-down` 200ms, both 48px travel, `ease-out-quart`, no overshoot. From 640px: 460px right drawer `rounded-l-3xl`, `drawer-in` / `drawer-out` with 32px travel. Backdrop `black/55` + 2px blur fades. Reduced motion: opacity only (140ms / 120ms). Its header carries a 70x96 mini jar (`rounded-[18px]`) that reuses the Glass atom.
- **QtyField `big`**: optional prop that starts the scale picker on kg / L. The sheet sets it when the ingredient is already counted in those units (>= 1000 base units, not pcs).
