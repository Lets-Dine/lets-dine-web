import { useEffect, useMemo, useState } from 'react';
import { createCategory, deleteCategory, moveCategory, renameCategory } from '../../api/staff';
import type { MenuCategory } from '../../domain/types';
import { useStaff } from '../../state/AuthContext';
import { ADMIN_GHOST, ADMIN_PRIMARY, ADMIN_TINY, Confirm, INPUT_BOX, useCommand } from '../../components/admin/kit';
import { ChevronLeft, Plus } from '../../components/icons';
import { DISPLAY, cx } from '../../components/ui';
import { haptic } from '../../platform/haptics';
import { useDashboard } from './AdminLayout';

/*
 * Categories, take two — same calls as `Categories`: create, rename, reorder, delete.
 * One list, ordered the way diners scroll the menu; the add form is the last row opening
 * up, and a category with dishes in it simply doesn't offer Delete (the API would refuse).
 */

/** A few to tap, for the owner who has no emoji keyboard handy. */
const SUGGESTED = ['🍳', '🥗', '🍜', '🍕', '🍔', '🍛', '🍰', '🥤'];

export function CategoriesV2() {
  const staff = useStaff();
  const { menu, reloadMenu } = useDashboard();
  const { pending, busy, run } = useCommand();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  /** The row that just moved, lit for a moment so the eye can follow it to its new place. */
  const [moved, setMoved] = useState<string | null>(null);
  useEffect(() => {
    if (!moved) return;
    const t = window.setTimeout(() => setMoved(null), 1200);
    return () => window.clearTimeout(t);
  }, [moved]);

  const ordered = useMemo(() => [...menu.categories].sort((a, b) => a.sortOrder - b.sortOrder), [menu.categories]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const dish of menu.dishes) {
      if (dish.isArchived) continue;
      map.set(dish.categoryId, (map.get(dish.categoryId) ?? 0) + 1);
    }
    return map;
  }, [menu.dishes]);
  const dishTotal = [...counts.values()].reduce((a, b) => a + b, 0);

  const act = (key: string, action: () => Promise<unknown>, message: string) => void run(key, action, message).then(reloadMenu);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-10 animate-rise">
        <h1 className={cx(DISPLAY, 'text-[clamp(38px,7vw,64px)] leading-[0.98] tracking-[-0.03em]')}>Categories</h1>
        <p className="mt-3 text-[14px] text-ink-3 tnum">
          {ordered.length} categor{ordered.length === 1 ? 'y' : 'ies'} · {dishTotal} dish{dishTotal === 1 ? '' : 'es'}. The order here is the order diners scroll through the menu.
        </p>
      </header>

      <ul className="divide-y divide-hairline border-y border-hairline">
        {ordered.map((category, index) => {
          const count = counts.get(category.id) ?? 0;
          return (
            <li key={category.id} className="animate-rise" style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}>
              {editing === category.id ? (
                <CategoryEditor
                  category={category}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSave={(nextName, nextEmoji) => {
                    setEditing(null);
                    act(category.id, () => renameCategory(staff, category.id, nextName, nextEmoji), 'Category updated');
                  }}
                />
              ) : (
                <div
                  className={cx(
                    'group flex items-center gap-4 px-2 py-4 transition-[background-color,opacity] duration-700 sm:px-3',
                    moved === category.id && 'bg-flame-2/10',
                    pending === category.id && 'opacity-50',
                  )}
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-[24px] ring-1 ring-hairline ring-inset transition-transform duration-300 ease-spring group-hover:-rotate-6 group-hover:scale-110" aria-hidden>
                    {category.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx(DISPLAY, 'block truncate text-[20px] leading-tight')}>{category.name}</span>
                    <span className="mt-0.5 block text-[13px] text-ink-3 tnum">
                      {count} dish{count === 1 ? '' : 'es'}
                    </span>
                  </span>

                  <div className="flex shrink-0 items-center gap-1 transition-opacity lg:opacity-0 lg:focus-within:opacity-100 lg:group-hover:opacity-100">
                    <button
                      type="button"
                      disabled={busy}
                      className={cx(ADMIN_TINY, 'bg-surface-2 ring-1 ring-hairline ring-inset')}
                      onClick={() => setEditing(category.id)}
                    >
                      Rename
                    </button>
                    {count === 0 ? (
                      <Confirm
                        label="Delete"
                        question="Delete it?"
                        confirmLabel="Delete"
                        disabled={busy}
                        onConfirm={() => act(category.id, () => deleteCategory(staff, category.id), `${category.name} deleted`)}
                      />
                    ) : (
                      <span className="hidden px-1.5 text-[12px] text-ink-4 sm:inline" title="Move or archive its dishes first">
                        Not empty
                      </span>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      aria-label={`Move ${category.name} up`}
                      disabled={index === 0 || busy}
                      className="grid size-7 place-items-center rounded-full text-ink-4 transition-[color,background-color,scale] hover:bg-surface-2 hover:text-ink active:scale-90 disabled:pointer-events-none disabled:opacity-25"
                      onClick={() => {
                        haptic.tick();
                        setMoved(category.id);
                        act(category.id, () => moveCategory(staff, category.id, -1), `${category.name} moved up`);
                      }}
                    >
                      <span className="rotate-90">
                        <ChevronLeft size={15} />
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${category.name} down`}
                      disabled={index === ordered.length - 1 || busy}
                      className="grid size-7 place-items-center rounded-full text-ink-4 transition-[color,background-color,scale] hover:bg-surface-2 hover:text-ink active:scale-90 disabled:pointer-events-none disabled:opacity-25"
                      onClick={() => {
                        haptic.tick();
                        setMoved(category.id);
                        act(category.id, () => moveCategory(staff, category.id, 1), `${category.name} moved down`);
                      }}
                    >
                      <span className="-rotate-90">
                        <ChevronLeft size={15} />
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-6">
        {adding ? (
          <form
            data-tour="add-category"
            className="animate-pop grid gap-4 rounded-3xl bg-surface p-5 ring-1 ring-flame-2/40 ring-inset"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim().length < 2) return;
              act('new', () => createCategory(staff, name, emoji), `${name.trim()} added`);
              setName('');
              setEmoji('');
              setAdding(false);
            }}
          >
            <div className="flex items-center gap-3">
              <input
                className={cx(INPUT_BOX, 'w-16 shrink-0 px-0 text-center text-[22px]')}
                value={emoji}
                maxLength={4}
                placeholder="🥐"
                aria-label="Emoji"
                onChange={(e) => setEmoji(e.target.value)}
              />
              <input
                className={cx(INPUT_BOX, 'min-w-0 flex-1')}
                value={name}
                maxLength={40}
                autoFocus
                placeholder="Breakfast"
                aria-label="Category name"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
              />
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Suggested emoji">
              {SUGGESTED.map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={emoji === e}
                  onClick={() => {
                    haptic.select();
                    setEmoji(e);
                  }}
                  className={cx(
                    'grid size-10 place-items-center rounded-full text-[19px] transition-[background-color,scale] duration-200 ease-spring active:scale-90',
                    emoji === e ? 'scale-110 bg-flame-2/20 ring-1 ring-flame-2/50 ring-inset' : 'bg-surface-2 hover:scale-110',
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button type="submit" className={ADMIN_PRIMARY} disabled={busy || name.trim().length < 2}>
                {pending === 'new' ? 'Adding…' : 'Add category'}
              </button>
              <button type="button" className={ADMIN_GHOST} onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
            <p className="text-[12.5px] leading-relaxed text-ink-4">
              A category can only be deleted once it is empty — move or archive its dishes first, so no dish is left without a home.
            </p>
          </form>
        ) : (
          <button
            type="button"
            data-tour="add-category"
            onClick={() => setAdding(true)}
            className="group flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl border border-dashed border-hairline-strong text-[14.5px] font-semibold text-ink-2 transition-[color,border-color,background-color] duration-200 hover:border-flame-2/60 hover:bg-flame-2/5 hover:text-ink"
          >
            <span className="grid size-6 place-items-center rounded-full bg-flame-2/15 text-flame-1 transition-transform duration-300 ease-spring group-hover:rotate-90">
              <Plus size={14} />
            </span>
            Add a category
          </button>
        )}
      </div>
    </div>
  );
}

function CategoryEditor({
  category,
  busy,
  onSave,
  onCancel,
}: {
  category: MenuCategory;
  busy: boolean;
  onSave: (name: string, emoji: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [emoji, setEmoji] = useState(category.emoji);

  return (
    <form
      className="flex animate-swap flex-wrap items-center gap-2 px-2 py-4 sm:px-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name, emoji);
      }}
    >
      <input className={cx(INPUT_BOX, 'w-14 shrink-0 px-0 text-center text-[18px]')} value={emoji} maxLength={4} aria-label="Emoji" onChange={(e) => setEmoji(e.target.value)} />
      <input className={cx(INPUT_BOX, 'min-w-30 flex-1')} value={name} maxLength={40} aria-label="Category name" autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onCancel()} />
      <button type="button" className={ADMIN_GHOST} onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className={ADMIN_PRIMARY} disabled={busy || name.trim().length < 2}>
        Save
      </button>
    </form>
  );
}
