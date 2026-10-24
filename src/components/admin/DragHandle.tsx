import type { ComponentProps } from 'react';
import { cx } from '../ui';

/** The grip a row is dragged by (pass it `handleProps()`), slides open (no space reserved) while its `group` row is hovered, always there on touch. Callers pass a negative right margin matching the row's gap. */
export function DragHandle({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-drag-handle
      title="Drag to reorder"
      aria-hidden
      className={cx(
        'grid h-6 w-6 shrink-0 cursor-grab touch-none place-items-center overflow-hidden rounded-full text-ink-4 transition-[width,margin,color,background-color,opacity] duration-200 ease-out hover:bg-surface-2 hover:text-ink active:cursor-grabbing',
        '[@media(hover:hover)]:w-0 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:w-6 [@media(hover:hover)]:group-hover:opacity-100',
        // Rows the cursor passes mid-drag must not open their grips and shove the list around.
        '[body[data-reordering]_&]:!w-0 [body[data-reordering]_&]:!opacity-0',
        className,
      )}
      {...props}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        {[3, 7, 11].map((y) => [4.5, 9.5].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.2" />))}
      </svg>
    </span>
  );
}
