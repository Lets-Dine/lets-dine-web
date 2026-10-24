import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react';

/**
 * Live drag-to-reorder over native HTML5 drag and drop: rows shuffle under the cursor while dragging,
 * and `onDrop(id, overId)` fires once with the original-list item now sitting where the dragged one landed.
 * Rows glide to their new slots (FLIP). After a drop the previewed order is held until `items` changes (the reload), so rows don't snap back.
 */
export function useDragReorder<T extends { id: string }>(items: T[], onDrop: (id: string, overId: string) => void) {
  const [drag, setDrag] = useState<{ id: string; order: string[]; committed: boolean } | null>(null);
  useEffect(() => setDrag(null), [items]);

  useEffect(() => {
    if (!drag) return;
    document.body.dataset.reordering = '';
    return () => void delete document.body.dataset.reordering;
  }, [drag === null]);

  const list = useMemo(() => {
    if (!drag) return items;
    const byId = new Map(items.map((i) => [i.id, i]));
    return drag.order.flatMap((id) => byId.get(id) ?? []);
  }, [items, drag]);

  // FLIP: remember each row's top, and after the order changes slide it from the old spot to the new one.
  const els = useRef(new Map<string, HTMLElement>());
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const [id, el] of els.current) {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const delta = (tops.current.get(id) ?? top) - top;
      if (delta && !still) el.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
      tops.current.set(id, top);
    }
  }, [list]);

  // A row in mid-glide sits under the cursor and would trigger a swap straight back, so ignore hovers on that row until it settles.
  // Only the rows that moved are held; the next row along swaps at once instead of waiting out a blanket delay.
  const settleAt = useRef(new Map<string, number>());

  const rowProps = (id: string) => ({
    ref: (el: HTMLElement | null) => void (el ? els.current.set(id, el) : els.current.delete(id)),
    onDragStart: (e: DragEvent) => {
      // Only the grip starts a reorder; a bubbled drag from a photo or link inside the row is cancelled.
      if (!(e.target as HTMLElement).closest('[data-drag-handle]')) return e.preventDefault();
      e.dataTransfer.effectAllowed = 'move';
      const row = e.currentTarget as HTMLElement;
      const box = row.getBoundingClientRect();
      // Dress the row for the snapshot only: a border, and the first opaque background above it so it isn't see-through.
      let bg = row as HTMLElement | null;
      while (bg && getComputedStyle(bg).backgroundColor === 'rgba(0, 0, 0, 0)') bg = bg.parentElement;
      const saved = row.style.cssText;
      row.style.cssText += `;box-shadow:inset 0 0 0 2px var(--color-flame-2);border-radius:16px;background:${bg ? getComputedStyle(bg).backgroundColor : 'transparent'}`;
      e.dataTransfer.setDragImage(row, e.clientX - box.left, e.clientY - box.top);
      setTimeout(() => (row.style.cssText = saved));
      // Deferred: React flushes this render before the browser snapshots the drag image, which would capture the emptied slot.
      const order = items.map((i) => i.id);
      setTimeout(() => setDrag({ id, order, committed: false }));
    },
    onDragOver: (e: DragEvent) => {
      if (!drag) return;
      e.preventDefault();
      if (drag.id === id || Date.now() < (settleAt.current.get(id) ?? 0)) return;
      const order = [...drag.order];
      order.splice(order.indexOf(id), 0, ...order.splice(order.indexOf(drag.id), 1));
      // Every row between the dragged row's old and new slot glides.
      const [from, to] = [drag.order.indexOf(drag.id), order.indexOf(drag.id)].sort((a, b) => a - b);
      for (const moved of drag.order.slice(from, to + 1)) settleAt.current.set(moved, Date.now() + 240);
      setDrag({ ...drag, order });
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (!drag) return;
      const over = items[drag.order.indexOf(drag.id)];
      if (!over || over.id === drag.id) return setDrag(null);
      setDrag({ ...drag, committed: true });
      onDrop(drag.id, over.id);
    },
    onDragEnd: () => setDrag((d) => (d?.committed ? d : null)),
  });

  const handleProps = (enabled = true) => ({ draggable: enabled && !drag?.committed });

  return { list, handleProps, dragId: drag?.committed ? null : (drag?.id ?? null), rowProps };
}
