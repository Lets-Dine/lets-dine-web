import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { moveDish, setDishArchived, updateDish } from '../../api/staff';
import { formatMoney } from '../../domain/money';
import type { Dish, MenuCategory } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { DishImage } from '../../components/Bits';
import {
  ADMIN_PRIMARY,
  ADMIN_TINY,
  Confirm,
  Empty,
  INPUT_BOX,
  PANEL,
  PageTitle,
  Panel,
  Segmented,
  useCommand,
} from '../../components/admin/kit';
import { ChevronLeft, Search } from '../../components/icons';
import { cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/**
 * §28. The menu, as the restaurant sees it.
 *
 * The two changes that happen daily — a dish selling out, a dish coming back —
 * are one tap from the list. Everything slower lives behind Edit. Archived
 * dishes are hidden by default but never gone: they hold the names and prices
 * that historical orders point at.
 */

type Scope = 'live' | 'unavailable' | 'archived';

export function MenuBoard() {
  const staff = useStaff();
  const { allows } = useAuth();
  const { menu, reloadMenu } = useDashboard();
  const { pending, run } = useCommand();

  const [scope, setScope] = useState<Scope>('live');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string>('all');

  const editable = allows('menu:edit');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return menu.dishes.filter((dish) => {
      if (scope === 'archived' ? !dish.isArchived : dish.isArchived) return false;
      if (scope === 'unavailable' && dish.isAvailable) return false;
      if (categoryId !== 'all' && dish.categoryId !== categoryId) return false;
      if (needle && !dish.name.toLowerCase().includes(needle) && !dish.description.toLowerCase().includes(needle))
        return false;
      return true;
    });
  }, [menu.dishes, scope, query, categoryId]);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, Dish[]>();
    for (const dish of visible) {
      const list = byCategory.get(dish.categoryId) ?? [];
      list.push(dish);
      byCategory.set(dish.categoryId, list);
    }
    for (const list of byCategory.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return menu.categories
      .map((category) => ({ category, dishes: byCategory.get(category.id) ?? [] }))
      .filter((group) => group.dishes.length > 0);
  }, [visible, menu.categories]);

  const counts = {
    live: menu.dishes.filter((d) => !d.isArchived).length,
    unavailable: menu.dishes.filter((d) => !d.isArchived && !d.isAvailable).length,
    archived: menu.dishes.filter((d) => d.isArchived).length,
  };

  const act = (key: string, action: () => Promise<unknown>, message: string) =>
    void run(key, action, message).then(reloadMenu);

  return (
    <>
      <PageTitle
        title="Menu"
        subtitle={`${counts.live} dishes across ${menu.categories.length} categories`}
        action={
          editable && (
            <Link to="/admin/menu/new" className={ADMIN_PRIMARY}>
              Add a dish
            </Link>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Which dishes"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'live', label: `On the menu (${counts.live})` },
            { value: 'unavailable', label: `Unavailable (${counts.unavailable})` },
            { value: 'archived', label: `Archived (${counts.archived})` },
          ]}
        />

        <label className="relative min-w-[180px] flex-1">
          <span className="sr-only">Search dishes</span>
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-4">
            <Search size={16} />
          </span>
          <input
            className={cx(INPUT_BOX, 'pl-10')}
            value={query}
            placeholder="Search dishes"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <select
          className={cx(INPUT_BOX, 'w-auto appearance-none py-2')}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="all" className="bg-surface-2">
            All categories
          </option>
          {menu.categories.map((c) => (
            <option key={c.id} value={c.id} className="bg-surface-2">
              {c.emoji} {c.name}
            </option>
          ))}
        </select>
      </div>

      {grouped.length === 0 ? (
        <Panel>
          <Empty
            emoji="🍳"
            title="No dishes here"
            message={
              scope === 'archived'
                ? 'Nothing has been archived. Archived dishes keep their order history but leave the diner menu.'
                : 'Nothing matches those filters.'
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-4">
          {grouped.map(({ category, dishes }) => (
            <CategoryGroup
              key={category.id}
              category={category}
              dishes={dishes}
              currency={menu.restaurant.currency}
              editable={editable}
              pending={pending}
              onToggleAvailable={(dish) =>
                act(
                  dish.id,
                  () => updateDish(staff, dish.id, { isAvailable: !dish.isAvailable }),
                  dish.isAvailable ? `${dish.name} marked unavailable` : `${dish.name} is back on`,
                )
              }
              onToggleFeatured={(dish) =>
                act(
                  dish.id,
                  () => updateDish(staff, dish.id, { isFeatured: !dish.isFeatured }),
                  dish.isFeatured ? `${dish.name} is no longer a staff pick` : `${dish.name} is a staff pick`,
                )
              }
              onMove={(dish, direction) =>
                act(dish.id, () => moveDish(staff, dish.id, direction), `${dish.name} moved`)
              }
              onArchive={(dish) =>
                act(
                  dish.id,
                  () => setDishArchived(staff, dish.id, !dish.isArchived),
                  dish.isArchived ? `${dish.name} restored` : `${dish.name} archived`,
                )
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

interface GroupProps {
  category: MenuCategory;
  dishes: Dish[];
  currency: string;
  editable: boolean;
  pending: string | null;
  onToggleAvailable: (dish: Dish) => void;
  onToggleFeatured: (dish: Dish) => void;
  onMove: (dish: Dish, direction: -1 | 1) => void;
  onArchive: (dish: Dish) => void;
}

function CategoryGroup({ category, dishes, currency, editable, pending, ...handlers }: GroupProps) {
  return (
    <Panel title={`${category.emoji} ${category.name}`} hint={`${dishes.length} dishes`} bare>
      <ul>
        {dishes.map((dish, index) => (
          <li
            key={dish.id}
            className={cx(
              'flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3 last:border-0 sm:px-5',
              pending === dish.id && 'opacity-50',
              !dish.isAvailable && !dish.isArchived && 'bg-berry/[0.04]',
            )}
          >
            <DishImage dish={dish} className="size-12 shrink-0 rounded-xl" monogram="text-base" />

            <div className="min-w-0 flex-1 basis-45">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14.5px] font-semibold">{dish.name}</span>
                {dish.isFeatured && <span title="Staff pick">👨‍🍳</span>}
                {!dish.isAvailable && !dish.isArchived && (
                  <span className="rounded-full bg-berry/14 px-2 py-0.5 text-[11px] font-bold text-[#ff8098]">Off</span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-ink-4">
                <span className="font-semibold tnum text-ink-2">{formatMoney(dish.price, currency)}</span>
                <span aria-hidden>·</span>
                <span className="tnum">
                  {dish.stats.avgRating !== null
                    ? `${dish.stats.avgRating.toFixed(1)} ★ (${dish.stats.ratingCount})`
                    : 'No ratings yet'}
                </span>
                <span aria-hidden className="hidden sm:inline">
                  ·
                </span>
                <span className="hidden tnum sm:inline">{dish.stats.orders30d} orders / 30d</span>
              </div>
            </div>

            {editable ? (
              <div className="flex shrink-0 items-center gap-1">
                {!dish.isArchived && (
                  <>
                    <div className="mr-1 hidden items-center gap-0.5 sm:flex">
                      <button
                        type="button"
                        aria-label={`Move ${dish.name} up`}
                        disabled={index === 0 || pending !== null}
                        className={cx(ADMIN_TINY, 'px-1.5 text-ink-4 hover:text-ink')}
                        onClick={() => handlers.onMove(dish, -1)}
                      >
                        <span className="rotate-90">
                          <ChevronLeft size={15} />
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${dish.name} down`}
                        disabled={index === dishes.length - 1 || pending !== null}
                        className={cx(ADMIN_TINY, 'px-1.5 text-ink-4 hover:text-ink')}
                        onClick={() => handlers.onMove(dish, 1)}
                      >
                        <span className="-rotate-90">
                          <ChevronLeft size={15} />
                        </span>
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={pending !== null}
                      className={cx(
                        ADMIN_TINY,
                        dish.isAvailable
                          ? 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset'
                          : 'bg-mint/14 text-[#6fd7a4]',
                      )}
                      onClick={() => handlers.onToggleAvailable(dish)}
                    >
                      {dish.isAvailable ? 'Mark unavailable' : 'Put back on'}
                    </button>

                    <button
                      type="button"
                      disabled={pending !== null}
                      className={cx(ADMIN_TINY, 'hidden text-ink-4 hover:text-ink lg:inline-flex')}
                      onClick={() => handlers.onToggleFeatured(dish)}
                    >
                      {dish.isFeatured ? 'Unpick' : 'Staff pick'}
                    </button>
                  </>
                )}

                <Link to={`/admin/menu/${dish.id}`} className={cx(ADMIN_TINY, 'bg-surface-2 ring-1 ring-hairline ring-inset')}>
                  Edit
                </Link>

                {dish.isArchived ? (
                  <button
                    type="button"
                    disabled={pending !== null}
                    className={cx(ADMIN_TINY, 'text-mint')}
                    onClick={() => handlers.onArchive(dish)}
                  >
                    Restore
                  </button>
                ) : (
                  <Confirm
                    label="Archive"
                    question="Archive it?"
                    confirmLabel="Archive"
                    disabled={pending !== null}
                    onConfirm={() => handlers.onArchive(dish)}
                  />
                )}
              </div>
            ) : (
              <span className={cx(PANEL, 'px-2.5 py-1 text-[12px] text-ink-4')}>View only</span>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
