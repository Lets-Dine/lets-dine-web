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
  INPUT_BOX,
  PageTitle,
  Perforation,
  Segmented,
  useCommand,
} from '../../components/admin/kit';
import { ChevronLeft, Plate, Search, Sparkle } from '../../components/icons';
import { cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/**
 * §28. The menu, as the restaurant sees it — styled as the board it is:
 * one printed sheet, categories torn apart by a dashed rule, same paper
 * the till ledger (Payments.tsx) reads off. The two changes that happen
 * daily — a dish selling out, a dish coming back — are one tap from the
 * list. Everything slower lives behind Edit. Archived dishes are hidden
 * by default but never gone: they hold the names and prices that
 * historical orders point at.
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
        subtitle={
          staff.branches && staff.branches.length > 1
            ? `${staff.branches.find((b) => b.id === staff.branchId)?.name ?? 'This branch'}'s own menu. Every dish live on the board, one tap from selling out or coming back.`
            : 'Every dish live on the board, one tap from selling out or coming back.'
        }
        action={
          editable && (
            <Link to="/admin/menu/new" className={ADMIN_PRIMARY}>
              Add a dish
            </Link>
          )
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
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
        <div className="overflow-hidden rounded-[28px] bg-docket-surface text-docket-ink ring-1 ring-docket-line">
          <div className="grid justify-items-center gap-2 px-6 py-14 text-center">
            <Plate size={28} className="text-docket-inksoft/70" />
            <h3 className="text-[15px] font-semibold tracking-tight">No dishes here</h3>
            <p className="max-w-[38ch] text-[13px] leading-relaxed text-docket-inksoft">
              {scope === 'archived'
                ? 'Nothing has been archived. Archived dishes keep their order history but leave the diner menu.'
                : 'Nothing matches those filters.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {grouped.map(({ category, dishes }) => (
            <CategorySection
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

function CategorySection({ category, dishes, currency, editable, pending, ...handlers }: GroupProps) {
  return (
    <div className="overflow-hidden rounded-[28px] bg-docket-surface text-docket-ink ring-1 ring-docket-line">
      <div className="flex items-baseline justify-between gap-3 px-6 pt-5 pb-4">
        <h3 className="font-display text-[18px] font-black tracking-tight">
          {category.emoji} {category.name}
        </h3>
        <span className="shrink-0 text-[11px] font-bold tracking-wide text-docket-inksoft uppercase">
          {dishes.length} dish{dishes.length === 1 ? '' : 'es'}
        </span>
      </div>
      <Perforation />
      {dishes.map((dish, index) => (
        <DishRow
          key={dish.id}
          dish={dish}
          index={index}
          count={dishes.length}
          currency={currency}
          editable={editable}
          pending={pending}
          onToggleAvailable={() => handlers.onToggleAvailable(dish)}
          onToggleFeatured={() => handlers.onToggleFeatured(dish)}
          onMove={(direction) => handlers.onMove(dish, direction)}
          onArchive={() => handlers.onArchive(dish)}
        />
      ))}
    </div>
  );
}

function Stamp({ tone, children }: { tone: 'pick' | 'off'; children: React.ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-bold tracking-wide uppercase',
        tone === 'pick' ? 'border-docket-ink/35 text-docket-ink/85' : 'border-docket-berry/45 text-docket-berry',
      )}
    >
      {children}
    </span>
  );
}

function DishRow({
  dish,
  index,
  count,
  currency,
  editable,
  pending,
  onToggleAvailable,
  onToggleFeatured,
  onMove,
  onArchive,
}: {
  dish: Dish;
  index: number;
  count: number;
  currency: string;
  editable: boolean;
  pending: string | null;
  onToggleAvailable: () => void;
  onToggleFeatured: () => void;
  onMove: (direction: -1 | 1) => void;
  onArchive: () => void;
}) {
  const busy = pending === dish.id;
  const off = !dish.isAvailable && !dish.isArchived;

  return (
    <div
      className={cx(
        'flex flex-wrap items-center gap-3.5 border-t border-dashed border-docket-line px-6 py-4 first:border-t-0',
        busy && 'opacity-50',
      )}
    >
      <DishImage dish={dish} className="size-11 shrink-0 rounded-full ring-1 ring-docket-line" monogram="text-[13px]" />

      <div className="min-w-0 flex-1 basis-45">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[14px] font-bold">{dish.name}</span>
          {dish.isFeatured && (
            <Stamp tone="pick">
              <Sparkle size={9} /> Pick
            </Stamp>
          )}
          {off && <Stamp tone="off">Off</Stamp>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-docket-inksoft">
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

      <span className="font-display shrink-0 text-[17px] font-black tnum">{formatMoney(dish.price, currency)}</span>

      {editable ? (
        <div className="flex shrink-0 items-center gap-1">
          {!dish.isArchived && (
            <>
              <div className="mr-0.5 hidden items-center gap-0.5 sm:flex">
                <button
                  type="button"
                  aria-label={`Move ${dish.name} up`}
                  disabled={index === 0 || pending !== null}
                  className={cx(ADMIN_TINY, 'px-1.5 text-docket-inksoft hover:text-docket-ink')}
                  onClick={() => onMove(-1)}
                >
                  <span className="rotate-90">
                    <ChevronLeft size={15} />
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Move ${dish.name} down`}
                  disabled={index === count - 1 || pending !== null}
                  className={cx(ADMIN_TINY, 'px-1.5 text-docket-inksoft hover:text-docket-ink')}
                  onClick={() => onMove(1)}
                >
                  <span className="-rotate-90">
                    <ChevronLeft size={15} />
                  </span>
                </button>
              </div>

              <button
                type="button"
                disabled={pending !== null}
                className={cx(ADMIN_TINY, dish.isAvailable ? 'bg-docket-line/70 text-docket-ink' : 'bg-mint/16 text-docket-mint')}
                onClick={onToggleAvailable}
              >
                {dish.isAvailable ? 'Mark unavailable' : 'Put back on'}
              </button>

              <button
                type="button"
                disabled={pending !== null}
                className={cx(ADMIN_TINY, 'hidden text-docket-inksoft hover:text-docket-ink lg:inline-flex')}
                onClick={onToggleFeatured}
              >
                {dish.isFeatured ? 'Unpick' : 'Staff pick'}
              </button>
            </>
          )}

          <Link to={`/admin/menu/${dish.id}`} className={cx(ADMIN_TINY, 'bg-docket-line/70 text-docket-ink')}>
            Edit
          </Link>

          {dish.isArchived ? (
            <button
              type="button"
              disabled={pending !== null}
              className={cx(ADMIN_TINY, 'text-docket-mint')}
              onClick={onArchive}
            >
              Restore
            </button>
          ) : (
            <Confirm
              label="Archive"
              question="Archive it?"
              confirmLabel="Archive"
              disabled={pending !== null}
              onConfirm={onArchive}
              tone="paper"
            />
          )}
        </div>
      ) : (
        <span className="rounded-lg bg-docket-line/60 px-2.5 py-1 text-[12px] text-docket-inksoft">View only</span>
      )}
    </div>
  );
}
