import { useMemo, useState } from 'react';
import { createCategory, deleteCategory, moveCategory, renameCategory } from '../../api/staff';
import type { MenuCategory } from '../../domain/types';
import { useStaff } from '../../state/AuthContext';
import {
  ADMIN_GHOST,
  ADMIN_PRIMARY,
  ADMIN_TINY,
  Confirm,
  Field,
  INPUT_BOX,
  PageTitle,
  Perforation,
  TextInput,
  useCommand,
} from '../../components/admin/kit';
import { ChevronLeft } from '../../components/icons';
import { cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/**
 * §28. Categories are the menu's spine: their order is the order a diner
 * scrolls through the food. Renaming one is safe, so it edits in place;
 * deleting one is not, so it asks — and the API refuses outright while dishes
 * are still standing in it, rather than orphaning them.
 */
export function Categories() {
  const staff = useStaff();
  const { menu, reloadMenu } = useDashboard();
  const { pending, busy, run } = useCommand();

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const ordered = useMemo(() => [...menu.categories].sort((a, b) => a.sortOrder - b.sortOrder), [menu.categories]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const dish of menu.dishes) {
      if (dish.isArchived) continue;
      map.set(dish.categoryId, (map.get(dish.categoryId) ?? 0) + 1);
    }
    return map;
  }, [menu.dishes]);

  const act = (key: string, action: () => Promise<unknown>, message: string) =>
    void run(key, action, message).then(reloadMenu);

  return (
    <>
      <PageTitle title="Categories" subtitle="The order here is the order diners scroll through the menu." />

      <div className="grid gap-4 lg:grid-cols-[1.9fr_1fr] lg:items-start">
        <div className="overflow-hidden rounded-[28px] bg-docket-surface text-docket-ink ring-1 ring-docket-line">
          <div className="flex items-baseline justify-between gap-3 px-6 pt-5 pb-4">
            <h2 className="font-display text-[18px] font-black tracking-tight">Menu order</h2>
          </div>
          <Perforation />
          <ul>
            {ordered.map((category, index) => (
              <li key={category.id}>
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
                  <>
                    <div className={cx('flex items-center gap-3 px-6 py-4', pending === category.id && 'opacity-50')}>
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-[17px]" aria-hidden>
                      {category.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold">{category.name}</span>
                      <span className="block text-[12.5px] text-ink-4">
                        {counts.get(category.id) ?? 0} dish{(counts.get(category.id) ?? 0) === 1 ? '' : 'es'}
                      </span>
                    </span>

                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        aria-label={`Move ${category.name} up`}
                        disabled={index === 0 || busy}
                        className={cx(ADMIN_TINY, 'px-1.5 text-ink-4 hover:text-ink')}
                        onClick={() => act(category.id, () => moveCategory(staff, category.id, -1), `${category.name} moved up`)}
                      >
                        <span className="rotate-90">
                          <ChevronLeft size={15} />
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${category.name} down`}
                        disabled={index === ordered.length - 1 || busy}
                        className={cx(ADMIN_TINY, 'px-1.5 text-ink-4 hover:text-ink')}
                        onClick={() => act(category.id, () => moveCategory(staff, category.id, 1), `${category.name} moved down`)}
                      >
                        <span className="-rotate-90">
                          <ChevronLeft size={15} />
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className={cx(ADMIN_TINY, 'bg-surface-2 ring-1 ring-hairline ring-inset')}
                        onClick={() => setEditing(category.id)}
                      >
                        Rename
                      </button>
                      <Confirm
                        label="Delete"
                        question="Delete it?"
                        confirmLabel="Delete"
                        disabled={busy}
                        onConfirm={() =>
                          act(category.id, () => deleteCategory(staff, category.id), `${category.name} deleted`)
                        }
                      />
                    </div>
                    </div>
                    {index < ordered.length - 1 && <Perforation />}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="overflow-hidden rounded-[28px] bg-docket-surface text-docket-ink ring-1 ring-docket-line">
          <div className="flex items-baseline justify-between gap-3 px-6 pt-5 pb-4">
            <h2 className="font-display text-[18px] font-black tracking-tight">Add a category</h2>
          </div>
          <Perforation />
          <form
            className="grid gap-4 px-6 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              act('new', () => createCategory(staff, name, emoji), `${name.trim()} added`);
              setName('');
              setEmoji('');
            }}
          >
            <Field label="Name">
              <TextInput value={name} onChange={setName} maxLength={40} placeholder="Breakfast" />
            </Field>
            <Field label="Emoji" hint="Shown beside the name on the diner menu.">
              <TextInput value={emoji} onChange={setEmoji} maxLength={4} placeholder="🥐" className={cx('w-20 text-center text-sm')} />
            </Field>
            <button type="submit" className={ADMIN_PRIMARY} disabled={busy || name.trim().length < 2}>
              {pending === 'new' ? 'Adding…' : 'Add category'}
            </button>
            <p className="text-[12.5px] leading-relaxed text-docket-inksoft">
              A category can only be deleted once it is empty — move or archive its dishes first, so no dish is left
              without a home.
            </p>
          </form>
        </div>
      </div>
    </>
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
      className="flex flex-wrap items-center gap-2 px-6 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name, emoji);
      }}
    >
      <input
        className={cx(INPUT_BOX, 'w-14 shrink-0 px-0 text-center text-[18px]')}
        value={emoji}
        maxLength={4}
        aria-label="Emoji"
        onChange={(e) => setEmoji(e.target.value)}
      />
      <input
        className={cx(INPUT_BOX, 'min-w-30 flex-1')}
        value={name}
        maxLength={40}
        aria-label="Category name"
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />
      <button type="button" className={ADMIN_GHOST} onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className={ADMIN_PRIMARY} disabled={busy || name.trim().length < 2}>
        Save
      </button>
    </form>
  );
}
