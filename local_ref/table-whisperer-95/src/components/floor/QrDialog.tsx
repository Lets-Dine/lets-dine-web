import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { printHtml } from "@/lib/print";
import { VENUE, type Table } from "@/lib/floor-data";

export function QrDialog({
  table,
  onClose,
}: {
  table: Table | null;
  onClose: () => void;
}) {
  const qrRef = useRef<HTMLDivElement>(null);

  const url = table
    ? `https://order.thecopperstove.com/t/${table.label.toLowerCase()}`
    : "";

  const print = () => {
    const svg = qrRef.current?.querySelector("svg")?.outerHTML ?? "";
    printHtml(
      `${VENUE.name} — ${table?.label} QR`,
      `<div class="center">
        <p class="muted">${VENUE.name}</p>
        <h1 style="font-size:34px;margin:6px 0 2px">${table?.label}</h1>
        <p style="font-size:11px;color:#6A5A45;margin:0 0 14px">${table?.seats} seats · scan to order</p>
        ${svg}
        <div class="rule"></div>
        <p style="font-size:10px;word-break:break-all">${url}</p>
      </div>`,
    );
  };

  return (
    <Dialog open={!!table} onOpenChange={(o) => !o && onClose()}>
      <DialogContent

        className="max-w-[19rem] gap-0 border-0 bg-paper p-0 font-mono text-ink"
      >
        <div className="px-5 pt-5 pb-5 text-center">
          <DialogTitle className="font-mono text-[10px] font-normal tracking-[0.2em] text-inksoft uppercase">
            Table QR · scan to order
          </DialogTitle>
          <p className="mt-2 font-display text-[30px] leading-none font-black">
            {table?.label}
          </p>
          <p className="mt-1 text-[11px] text-inksoft">{table?.seats} seats</p>

          <div className="my-4 border-t border-dashed border-ink/25" />

          <div ref={qrRef} className="flex justify-center">
            {table && (
              <QRCodeSVG
                value={url}
                size={168}
                bgColor="transparent"
                fgColor="#211A11"
                level="M"
              />
            )}
          </div>

          <p className="mt-4 text-[9px] break-all text-inksoft">{url}</p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <button
              onClick={print}
              className="col-span-2 rounded-[14px] bg-ink py-3.5 text-[13px] font-bold tracking-wide text-paper transition-transform active:translate-y-px"
            >
              Print QR
            </button>
            <button
              onClick={onClose}
              className="rounded-[14px] bg-paperline py-3.5 text-[12px] font-bold tracking-wide text-ink transition-transform active:translate-y-px"
            >
              Close
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
