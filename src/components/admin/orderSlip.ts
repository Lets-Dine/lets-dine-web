import type { KitchenTicket } from '../../api/kitchen';
import type { Order } from '../../domain/types';
import { buildSlip } from '../../printing/escpos';
import { printRaw, targetOf } from '../../printing/qz';
import { askReceiptPrinter, getState } from '../../printing/store';

/** The order's own lines as a ticket, so the slip is laid out exactly like a kitchen one. */
function ticketOf(order: Order): KitchenTicket {
  return {
    id: order.id,
    station: 'KITCHEN',
    number: 0,
    createdAt: order.createdAt,
    acknowledgedAt: null,
    lines: order.items
      .filter((i) => i.status !== 'CANCELLED')
      .map((i) => ({
        id: i.id,
        qtyDelta: i.quantity,
        dishNameSnapshot: i.dishNameSnapshot,
        variantNameSnapshot: i.variantNameSnapshot,
        addOnNames: i.addOns.map((a) => a.nameSnapshot),
        notes: i.notes,
      })),
    order: {
      reference: order.reference,
      orderType: order.orderType,
      tableName: order.tableName,
      floorName: order.floorName,
      floorVisitorName: order.floorVisitorName,
    },
  };
}

const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

function printInBrowser(order: Order, sheet: Window) {
  const place = order.tableName ?? order.floorVisitorName ?? order.floorName ?? (order.orderType === 'DELIVERY' ? 'Delivery' : 'Quick sale');
  const rows = ticketOf(order)
    .lines.map(
      (l) =>
        `<li><b>${l.qtyDelta}× ${esc(l.dishNameSnapshot)}</b>${l.variantNameSnapshot ? ` · ${esc(l.variantNameSnapshot)}` : ''}${l.addOnNames.map((n) => `<br>+ ${esc(n)}`).join('')}${l.notes ? `<br><i>${esc(l.notes)}</i>` : ''}</li>`,
    )
    .join('');
  sheet.document.write(
    `<title>Slip ${esc(order.reference)}</title><style>body{font:14px monospace;width:72mm;margin:0 auto}h1{font-size:20px;margin:8px 0 2px}ul{padding:0;list-style:none}li{padding:6px 0;border-top:1px dashed #000}</style><h1>${esc(place)}</h1><div>Order ${esc(order.reference)} · ${new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div><ul>${rows}</ul>`,
  );
  sheet.document.close();
  sheet.focus();
  sheet.print();
}

/**
 * Prints the order's slip the way a receipt prints: with a printer set up on this PC it asks which one (or the browser),
 * otherwise it goes straight to the browser. Resolves false only when pop-ups were blocked. The browser window is opened
 * before anything is awaited, or the blocker swallows it.
 */
export async function printOrderSlip(order: Order): Promise<boolean> {
  const asking = getState().agentOn;
  let sheet = asking ? null : window.open('', '_blank', 'width=420,height=640');
  if (!asking && !sheet) return false;
  const choice = asking ? await askReceiptPrinter() : 'browser';
  if (choice === null) return true;
  if (choice !== 'browser') {
    try {
      await printRaw(targetOf(choice), buildSlip(ticketOf(order), choice.paper, 'ORDER SLIP'));
      return true;
    } catch {
      /* printer or QZ Tray unreachable: the browser dialog still gets the slip out */
    }
  }
  sheet ??= window.open('', '_blank', 'width=420,height=640');
  if (!sheet) return false;
  printInBrowser(order, sheet);
  return true;
}
