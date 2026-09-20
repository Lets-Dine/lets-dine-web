import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Table } from "@/lib/floor-data";

export function EditTableDialog({
  table,
  onClose,
  onSave,
}: {
  table: Table | null;
  onClose: () => void;
  onSave: (tableId: string, label: string, seats: number) => void;
}) {
  const [label, setLabel] = useState("");
  const [seats, setSeats] = useState("2");

  useEffect(() => {
    if (table) {
      setLabel(table.label);
      setSeats(String(table.seats));
    }
  }, [table]);

  const seatCount = Number(seats);
  const valid = label.trim().length > 0 && Number.isFinite(seatCount) && seatCount > 0;

  const save = () => {
    if (!table || !valid) return;
    onSave(table.id, label.trim(), Math.round(seatCount));
    onClose();
  };

  return (
    <Dialog open={!!table} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[19rem] gap-0 border-0 bg-paper p-0 font-mono text-ink">
        <div className="px-4 pt-4 pb-5">
          <DialogTitle className="font-mono text-[10px] font-normal tracking-[0.2em] text-inksoft uppercase">
            Edit table
          </DialogTitle>

          <label className="mt-4 block text-[10px] tracking-[0.16em] text-inksoft uppercase">
            Table name
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1 w-full rounded-[10px] bg-paperline px-3 py-2.5 font-mono text-[15px] font-bold text-ink outline-none ring-1 ring-ink/10 focus:ring-2 focus:ring-occupied/50"
          />

          <label className="mt-3 block text-[10px] tracking-[0.16em] text-inksoft uppercase">
            Seats
          </label>
          <div className="mt-1 flex items-center gap-2">
            <button
              aria-label="Fewer seats"
              onClick={() => setSeats((s) => String(Math.max(1, Number(s) - 1)))}
              className="size-10 rounded-[10px] bg-paperline text-[18px] font-bold text-ink active:translate-y-px"
            >
              −
            </button>
            <input
              inputMode="numeric"
              value={seats}
              onChange={(e) => setSeats(e.target.value.replace(/[^0-9]/g, ""))}
              className="w-full rounded-[10px] bg-paperline px-3 py-2.5 text-center font-mono text-[15px] font-bold text-ink outline-none ring-1 ring-ink/10 focus:ring-2 focus:ring-occupied/50"
            />
            <button
              aria-label="More seats"
              onClick={() => setSeats((s) => String(Math.min(30, Number(s || 0) + 1)))}
              className="size-10 rounded-[10px] bg-paperline text-[18px] font-bold text-ink active:translate-y-px"
            >
              +
            </button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <button
              onClick={save}
              disabled={!valid}
              className="col-span-2 rounded-[14px] bg-ink py-3 text-[13px] font-bold tracking-wide text-paper active:translate-y-px disabled:opacity-40"
            >
              Save table
            </button>
            <button
              onClick={onClose}
              className="rounded-[14px] bg-paperline py-3 text-[12px] font-bold tracking-wide text-ink active:translate-y-px"
            >
              Cancel
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
