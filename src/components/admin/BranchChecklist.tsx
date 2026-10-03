import type { BranchRef } from '../../domain/types';
import { cx } from '../ui';

/**
 * Which branches a manager or staff member works at. At least one must stay ticked — somebody pinned
 * to nothing could not sign in — so unticking the last one is simply not offered.
 */
export function BranchChecklist({
  branches,
  value,
  onChange,
  disabled = false,
}: {
  branches: BranchRef[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (id: string) => {
    if (value.includes(id)) {
      if (value.length > 1) onChange(value.filter((existing) => existing !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Branches">
      {branches.map((branch) => {
        const on = value.includes(branch.id);
        return (
          <button
            key={branch.id}
            type="button"
            role="checkbox"
            aria-checked={on}
            disabled={disabled}
            onClick={() => toggle(branch.id)}
            className={cx(
              'rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 ring-inset transition-colors disabled:opacity-50',
              on ? 'bg-flame/15 text-flame-1 ring-flame/40' : 'bg-surface-2 text-ink-3 ring-hairline hover:text-ink',
            )}
          >
            {on ? '✓ ' : ''}
            {branch.name}
          </button>
        );
      })}
    </div>
  );
}
