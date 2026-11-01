---
version: 1
slug: "src-components-admin-neworder-tsx"
primary_target: "src/components/admin/NewOrder.tsx"
related_targets: ["src/routes/admin/OrdersV2.tsx","src/routes/admin/DashboardV2.tsx"]
---

## Scope

The staff "New order" composer, opened from the Orders page and the Dashboard (button or N). Operate mode, inside the established admin world. Audience: floor staff and managers mid-shift, often at a laptop on the pass or a tablet. Job: put in an order for a table (seats it or joins its running visit), a floor spot, or a delivery; name the guest; add dishes; place it straight to the kitchen. Must stay fast for a regular (table, skip guest, three dishes, place).

## Direction contract

THESIS: The order is a kitchen docket that writes itself. One question is asked at a time, and each answer is inked onto the docket as a line. The docket is the progress, the summary and the place-order control at once. Refuses the stepper wizard (step bar, Back/Continue, screen-per-question) and the everything-at-once form.
OWN-WORLD: The admin brasserie world unchanged: board-dark ground, docket slip in docket tokens with a zig-zag tear at its foot, dashed perforations, Fraunces for the docket's values and the questions, Inter Tight for UI, Space Mono only for time and money on the slip. Flame for the single primary action; occupied/freedot for table state.
STORY: Staff see a clean docket and one serif question; they tap an answer and watch it ink onto the docket, then the next question appears; when the menu opens the window widens; they tap any docket line to change it; they place it from the foot of the docket.
FIRST VIEWPORT: A centered window ~920px wide. Left: the question in Fraunces ~36px and its answers as menu-card rows. Right: a column of darker board holding the docket slip, with header (New order, clock), FOR, TABLE and GUEST lines as blank ruled lines waiting, dishes area, subtotal, and Place order at the foot.
FORM: Docket-writes-itself, chosen by the user over order-as-sentence and folding sections; surface-scope extension, no concept roll.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: answers ink onto the docket (clip reveal, left to right), and the window grows from question width to menu width when the dishes open, then shrinks back when a docket line reopens its question.
