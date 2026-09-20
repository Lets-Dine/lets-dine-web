import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { DocketSheet } from "@/components/floor/DocketSheet";
import { EditTableDialog } from "@/components/floor/EditTableDialog";
import { QrDialog } from "@/components/floor/QrDialog";
import {
  MENU,
  VENUE,
  elapsed,
  initialTables,
  money,
  totalsOf,
  type Table,
} from "@/lib/floor-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Service Pass · The Copper Stove floor board" },
      {
        name: "description",
        content:
          "Live restaurant floor board: see which tables are occupied, print table QR codes, review orders, take payment and print receipts.",
      },
      { property: "og:title", content: "Service Pass · The Copper Stove floor board" },
      {
        property: "og:description",
        content:
          "Live restaurant floor board: table status, QR printing, order dockets, payment and receipts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FloorBoard,
});

type Filter = "all" | "occupied" | "free";

function FloorBoard() {
  const [tables, setTables] = useState<Table[]>(initialTables);
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [qrId, setQrId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const editTable = () => tables.find((t) => t.id === editId) ?? null;

  const saveTable = (tableId: string, label: string, seats: number) => {
    setTables((prev) =>
      prev.map((t) => (t.id === tableId ? { ...t, label, seats } : t)),
    );
    toast.success(`${label} updated`, { description: `${seats} seats.` });
  };

  const occupied = tables.filter((t) => t.occupied);
  const openTabs = useMemo(
    () => occupied.reduce((sum, t) => sum + totalsOf(t).total, 0),
    [occupied],
  );

  const visible = tables.filter((t) =>
    filter === "all" ? true : filter === "occupied" ? t.occupied : !t.occupied,
  );

  const openTable = tables.find((t) => t.id === openId) ?? null;
  const qrTable = tables.find((t) => t.id === qrId) ?? null;

  const clear = (table: Table): Table => ({
    id: table.id,
    label: table.label,
    seats: table.seats,
    disabled: !!table.disabled,
    occupied: false,
    items: [],
  });

  const pay = (table: Table) => {
    const { total } = totalsOf(table);
    setTables((prev) => prev.map((t) => (t.id === table.id ? clear(t) : t)));
    setOpenId(null);
    toast.success(`${table.label} paid · ${money(total)}`, {
      description: "Table cleared and back on the floor.",
    });
  };

  const endSession = (table: Table) => {
    setTables((prev) => prev.map((t) => (t.id === table.id ? clear(t) : t)));
    setOpenId(null);
    toast(`${table.label} session ended`, {
      description: "Tab discarded and the table is free again.",
    });
  };

  const toggleDisabled = (table: Table) => {
    setTables((prev) =>
      prev.map((t) => (t.id === table.id ? { ...t, disabled: !t.disabled } : t)),
    );
    toast(`${table.label} ${table.disabled ? "enabled" : "disabled"}`, {
      description: table.disabled
        ? "Back in service."
        : "Out of service — no new guests.",
    });
  };

  const changeQty = (tableId: string, name: string, delta: number) => {
    setTables((prev) =>
      prev.map((t) =>
        t.id === tableId
          ? {
              ...t,
              items: t.items
                .map((i) => (i.name === name ? { ...i, qty: i.qty + delta } : i))
                .filter((i) => i.qty > 0),
            }
          : t,
      ),
    );
  };

  const addItem = (tableId: string, name: string) => {
    const menuItem = MENU.find((m) => m.name === name);
    if (!menuItem) return;
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== tableId) return t;
        const existing = t.items.find((i) => i.name === name);
        const firedAt = new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        });
        return {
          ...t,
          occupied: true,
          seatedMinutes: t.seatedMinutes ?? 0,
          items: existing
            ? t.items.map((i) => (i.name === name ? { ...i, qty: i.qty + 1 } : i))
            : [...t.items, { ...menuItem, qty: 1, firedAt }],
        };
      }),
    );
  };

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: tables.length },
    { key: "occupied", label: "Occupied", count: occupied.length },
    { key: "free", label: "Free", count: tables.length - occupied.length },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-board pb-10 font-mono text-paper">
      <header className="px-4 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-[13px] tracking-wide text-brass italic">
              {VENUE.tagline}
            </p>
            <h1 className="mt-1 font-display text-[34px] leading-none font-black text-paper">
              {VENUE.name}
            </h1>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] tracking-[0.2em] text-paper/50 uppercase">{VENUE.shift}</p>
            <p className="mt-0.5 text-[11px] text-brass">{VENUE.lead}</p>
          </div>
        </div>

        <div className="mt-4 flex gap-1.5">
          {filters.map((f) => {
            const active = filter === f.key;
            const tone =
              f.key === "occupied"
                ? "text-occupied ring-occupied/40"
                : f.key === "free"
                  ? "text-freedot ring-freedot/40"
                  : "text-paper ring-paper/30";
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex-1 rounded-full py-2 text-[12px] font-bold tracking-wide ring-1 transition-colors ${
                  active ? "bg-paper text-ink ring-paper" : `bg-railed ${tone}`
                }`}
              >
                {f.label} {f.count}
              </button>
            );
          })}
        </div>
      </header>

      <div className="mx-4 flex items-center justify-between rounded-[14px] bg-railed px-4 py-3 ring-1 ring-brass/25">
        <div>
          <p className="text-[10px] tracking-[0.18em] text-paper/50 uppercase">Tables occupied</p>
          <p className="mt-1 font-display text-[30px] leading-none font-black text-paper">
            {occupied.length}
            <span className="text-[18px] text-paper/40">/{tables.length}</span>
          </p>
        </div>
        <div className="h-9 w-px bg-brass/20" />
        <div className="text-right">
          <p className="text-[10px] tracking-[0.18em] text-paper/50 uppercase">Open tabs</p>
          <p className="mt-1 font-display text-[30px] leading-none font-black text-brass">
            {money(openTabs)}
          </p>
        </div>
      </div>

      <p className="mt-5 mb-2 px-4 text-[11px] tracking-[0.2em] text-paper/45 uppercase">
        Floor
      </p>

      <div className="grid grid-cols-2 gap-2.5 px-4">
        {visible.map((table) => (
          <div
            key={table.id}
            className={`rise-in rounded-[14px] bg-railed p-3 ring-1 ${
              table.disabled
                ? "opacity-55 ring-paper/15"
                : table.occupied
                  ? "ring-occupied/50"
                  : "ring-freedot/30"
            }`}
          >
            <div className="flex items-start justify-between">
              <span
                className={`font-display text-[26px] leading-none font-black ${
                  table.occupied ? "text-paper" : "text-paper/80"
                }`}
              >
                {table.label}
              </span>
              <span className="mt-1 flex items-center gap-1.5">
                <span
                  className={`size-2 rounded-full ${
                    table.disabled
                      ? "bg-paper/30"
                      : table.occupied
                        ? "pulse-dot bg-occupied"
                        : "bg-freedot"
                  }`}
                />
                <span
                  className={`text-[9px] tracking-wide uppercase ${
                    table.disabled
                      ? "text-paper/40"
                      : table.occupied
                        ? "text-occupied"
                        : "text-freedot"
                  }`}
                >
                  {table.disabled ? "Off" : table.occupied ? "In use" : "Free"}
                </span>
              </span>
            </div>
            <p
              className={`mt-2 text-[11px] ${table.occupied ? "text-paper/55" : "text-paper/45"}`}
            >
              {table.seats} seats ·{" "}
              {table.disabled
                ? "out of service"
                : table.occupied
                  ? elapsed(table.seatedMinutes)
                  : "ready"}
            </p>

            <div className="mt-2 flex items-end justify-between">
              {table.occupied ? (
                <span className="font-mono text-[15px] font-bold text-brass">
                  {money(totalsOf(table).total)}
                </span>
              ) : (
                <span className="text-[11px] text-paper/30">—</span>
              )}
              <span className="flex gap-1">
                <button
                  onClick={() => setEditId(table.id)}
                  className="rounded-md px-1.5 py-0.5 text-[9px] tracking-wide text-paper/40 uppercase ring-1 ring-paper/15 transition-colors hover:text-brass hover:ring-brass/40"
                >
                  Edit
                </button>
                <button
                  onClick={() => setQrId(table.id)}
                  className="rounded-md px-1.5 py-0.5 text-[9px] tracking-wide text-paper/40 uppercase ring-1 ring-paper/15 transition-colors hover:text-brass hover:ring-brass/40"
                >
                  QR
                </button>
              </span>
            </div>

            <div className="mt-2.5 space-y-1.5">
              {table.occupied && (
                <button
                  onClick={() => setOpenId(table.id)}
                  className="w-full rounded-[10px] bg-occupied py-2 text-[11px] font-bold tracking-wide text-paper transition-transform active:translate-y-px"
                >
                  Payment
                </button>
              )}
              {table.occupied && (
                <button
                  onClick={() => endSession(table)}
                  className="w-full rounded-[10px] py-2 text-[10px] font-bold tracking-wide text-paper/70 uppercase ring-1 ring-paper/20 transition-transform active:translate-y-px"
                >
                  End session
                </button>
              )}
              {!table.occupied && (
                <button
                  onClick={() => toggleDisabled(table)}
                  className={`w-full rounded-[10px] py-2 text-[10px] font-bold tracking-wide uppercase ring-1 transition-transform active:translate-y-px ${
                    table.disabled
                      ? "text-freedot ring-freedot/40"
                      : "text-paper/60 ring-paper/20"
                  }`}
                >
                  {table.disabled ? "Enable table" : "Disable table"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <DocketSheet
        table={openTable}
        onClose={() => setOpenId(null)}
        onPay={pay}
        onEndSession={endSession}
        onChangeQty={changeQty}
        onAddItem={addItem}
        onShowQr={(t) => {
          setOpenId(null);
          setQrId(t.id);
        }}
      />
      <QrDialog table={qrTable} onClose={() => setQrId(null)} />
    </div>
  );
}
