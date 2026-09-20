import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { printHtml } from "@/lib/print";
import { MENU, VENUE, elapsed, money, totalsOf, type Table } from "@/lib/floor-data";

export function DocketSheet({
  table,
  onClose,
  onPay,
  onShowQr,
  onChangeQty,
  onAddItem,
  onEndSession,
}: {
  table: Table | null;
  onClose: () => void;
  onPay: (table: Table) => void;
  onShowQr: (table: Table) => void;
  onChangeQty: (tableId: string, name: string, delta: number) => void;
  onAddItem: (tableId: string, name: string) => void;
  onEndSession: (table: Table) => void;
}) {
  const [adding, setAdding] = useState(false);
  const totals = table ? totalsOf(table) : { subtotal: 0, tax: 0, total: 0 };

  const printReceipt = () => {
    if (!table) return;
    const rows = table.items
      .map(
        (i) =>
          `<div class="row"><span>${i.qty}× ${i.name}</span><span><b>${(i.qty * i.unitPrice).toFixed(2)}</b></span></div>`,
      )
      .join("");
    printHtml(
      `${VENUE.name} — ${table.label} receipt`,
      `<div class="center">
         <h1 style="font-size:26px">${VENUE.name}</h1>
         <p class="muted" style="margin:6px 0 0">${table.label} · ${table.seats} seats · Server ${table.server ?? "—"}</p>
       </div>
       <div class="rule"></div>
       ${rows}
       <div class="rule"></div>
       <div class="row"><span>Subtotal</span><span>${totals.subtotal.toFixed(2)}</span></div>
       <div class="row"><span>Tax 8.5%</span><span>${totals.tax.toFixed(2)}</span></div>
       <div class="row" style="align-items:baseline"><span class="display" style="font-size:16px">Total</span><span class="total">${money(totals.total)}</span></div>
       <div class="rule"></div>
       <p class="center" style="font-size:10px;color:#6A5A45">Thank you · ${new Date().toLocaleString()}</p>`,
    );
  };

  return (
    <Sheet
      open={!!table}
      onOpenChange={(o) => {
        if (!o) {
          setAdding(false);
          onClose();
        }
      }}
    >
      <SheetContent
        side="bottom"
        className="max-h-[88svh] overflow-y-auto rounded-t-[20px] border-0 bg-paper p-0 font-mono text-ink shadow-[0_-8px_30px_rgba(0,0,0,0.45)]"
      >
        {table && (
          <div className="clip-in px-4 pt-3 pb-6">
            <div className="mb-1 flex justify-center">
              <div className="size-3 rounded-full bg-board ring-4 ring-paper" />
            </div>

            <div className="flex items-start justify-between pt-2">
              <div>
                <SheetTitle className="font-mono text-[10px] font-normal tracking-[0.2em] text-inksoft uppercase">
                  Docket · clipped
                </SheetTitle>
                <h2 className="mt-1 font-display text-[30px] leading-none font-black text-ink">
                  Table {table.label.replace("T", "")}
                </h2>
                <p className="mt-1 text-[10px] tracking-[0.14em] text-inksoft uppercase">
                  Server {table.server ?? "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] tracking-wide text-inksoft uppercase">
                  {table.seats} seats
                </p>
                <p className="mt-0.5 text-[11px] font-bold text-occupied">
                  {table.occupied ? `${elapsed(table.seatedMinutes)} elapsed` : "Table free"}
                </p>
              </div>
            </div>

            <div className="my-3 border-t border-dashed border-ink/25" />

            {table.items.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-inksoft">
                No items on this tab yet. Add items below or print the QR so guests can order.
              </p>
            ) : (
              <div className="space-y-2.5 text-[13px]">
                {table.items.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 text-ink">
                      {item.name}
                      <span className="ml-2 text-[10px] text-inksoft">
                        {item.course} · {item.firedAt}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <button
                        aria-label={`Remove one ${item.name}`}
                        onClick={() => onChangeQty(table.id, item.name, -1)}
                        className="size-7 rounded-full bg-paperline text-[15px] leading-none font-bold text-ink active:translate-y-px"
                      >
                        −
                      </button>
                      <span className="w-4 text-center text-[13px] font-bold">{item.qty}</span>
                      <button
                        aria-label={`Add one ${item.name}`}
                        onClick={() => onChangeQty(table.id, item.name, 1)}
                        className="size-7 rounded-full bg-paperline text-[15px] leading-none font-bold text-ink active:translate-y-px"
                      >
                        +
                      </button>
                      <span className="w-14 text-right font-bold">
                        {(item.qty * item.unitPrice).toFixed(2)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setAdding((v) => !v)}
              className="mt-3 w-full rounded-[12px] border border-dashed border-ink/30 py-2.5 text-[11px] font-bold tracking-[0.14em] text-inksoft uppercase active:translate-y-px"
            >
              {adding ? "Close menu" : "+ Add item"}
            </button>

            {adding && (
              <div className="mt-2 space-y-1.5 rounded-[12px] bg-paperline p-2">
                {MENU.map((m) => (
                  <button
                    key={m.name}
                    onClick={() => onAddItem(table.id, m.name)}
                    className="flex w-full items-baseline justify-between rounded-[9px] bg-paper px-3 py-2 text-[12px] active:translate-y-px"
                  >
                    <span>
                      {m.name}
                      <span className="ml-2 text-[10px] text-inksoft">{m.course}</span>
                    </span>
                    <span className="font-bold">{m.unitPrice.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="my-3 border-t border-dashed border-ink/25" />

            <div className="space-y-1 text-[12px]">
              <div className="flex items-baseline justify-between text-inksoft">
                <span>Subtotal</span>
                <span>{totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-baseline justify-between text-inksoft">
                <span>Tax 8.5%</span>
                <span>{totals.tax.toFixed(2)}</span>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <span className="font-display text-[18px] font-black text-ink">Total</span>
                <span className="font-display text-[26px] leading-none font-black text-occupied">
                  {money(totals.total)}
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                disabled={table.items.length === 0}
                onClick={() => onPay(table)}
                className="col-span-2 rounded-[14px] bg-occupied py-3.5 text-[14px] font-bold tracking-wide text-paper ring-2 ring-occupied/30 transition-transform active:translate-y-px disabled:opacity-40"
              >
                Take payment
              </button>
              <button
                disabled={table.items.length === 0}
                onClick={printReceipt}
                className="rounded-[14px] bg-ink py-3.5 text-[12px] font-bold tracking-wide text-paper transition-transform active:translate-y-px disabled:opacity-40"
              >
                Print
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => onShowQr(table)}
                className="rounded-[14px] bg-paperline py-3 text-[12px] font-bold tracking-wide text-ink transition-transform active:translate-y-px"
              >
                Print table QR
              </button>
              <button
                disabled={!table.occupied}
                onClick={() => onEndSession(table)}
                className="rounded-[14px] py-3 text-[12px] font-bold tracking-wide text-occupied ring-1 ring-occupied/40 transition-transform active:translate-y-px disabled:opacity-40"
              >
                End session
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
