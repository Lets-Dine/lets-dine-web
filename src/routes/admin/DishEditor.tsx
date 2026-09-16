import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createDish, setDishArchived, updateDish } from '../../api/staff';
import type { DishDraft } from '../../api/admin';
import { formatMoney } from '../../domain/money';
import { useAuth, useStaff } from '../../state/AuthContext';
import { DishImage } from '../../components/Bits';
import { RatingBreakdown } from '../../components/Rating';
import {
  ADMIN_GHOST,
  ADMIN_PRIMARY,
  Confirm,
  Field,
  Metric,
  MoneyInput,
  PageTitle,
  Panel,
  Select,
  TextArea,
  TextInput,
  Toggle,
  useCommand,
} from '../../components/admin/kit';
import { cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/**
 * One dish, everything about it. Creating and editing are the same form —
 * the only difference is which endpoint it calls and whether the ratings
 * panel has anything to say yet.
 *
 * Ratings are shown but never editable. They belong to the diners who earned
 * them by ordering the dish, and a restaurant that could edit its own ratings
 * would make every rating in the product worthless.
 */
export function DishEditor() {
  const { dishId } = useParams();
  const staff = useStaff();
  const { allows } = useAuth();
  const navigate = useNavigate();
  const { menu, reloadMenu } = useDashboard();
  const { busy, run } = useCommand();

  const existing = dishId === 'new' ? null : menu.dishes.find((d) => d.id === dishId);
  const isNew = dishId === 'new';

  const [draft, setDraft] = useState<DishDraft>(() => ({
    name: existing?.name ?? '',
    description: existing?.description ?? '',
    categoryId: existing?.categoryId ?? menu.categories[0]?.id ?? '',
    price: existing?.price ?? 0,
    imageUrl: existing?.imageUrl ?? null,
    isVeg: existing?.isVeg ?? false,
    spiceLevel: existing?.spiceLevel ?? 0,
    isAvailable: existing?.isAvailable ?? true,
    isFeatured: existing?.isFeatured ?? false,
  }));

  const patch = <K extends keyof DishDraft>(key: K, value: DishDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  /** Photos already bundled with the menu, so a new dish can borrow one. */
  const library = useMemo(
    () => [...new Set(menu.dishes.map((d) => d.imageUrl).filter((url): url is string => Boolean(url)))],
    [menu.dishes],
  );

  if (!isNew && !existing)
    return (
      <Panel>
        <p className="py-8 text-center text-[14px] text-ink-3">
          That dish is no longer on the menu.{' '}
          <Link to="/admin/menu" className="font-semibold text-flame-1">
            Back to the menu
          </Link>
        </p>
      </Panel>
    );

  const canEdit = allows('menu:edit');
  const dirty =
    !existing ||
    draft.name !== existing.name ||
    draft.description !== existing.description ||
    draft.categoryId !== existing.categoryId ||
    draft.price !== existing.price ||
    draft.imageUrl !== existing.imageUrl ||
    draft.isVeg !== existing.isVeg ||
    draft.spiceLevel !== existing.spiceLevel ||
    draft.isAvailable !== existing.isAvailable ||
    draft.isFeatured !== existing.isFeatured;

  const save = () => {
    if (isNew) {
      void run('save', () => createDish(staff, draft), `${draft.name.trim()} added to the menu`).then((ok) => {
        reloadMenu();
        if (ok) navigate('/admin/menu');
      });
      return;
    }
    void run('save', () => updateDish(staff, existing!.id, draft), `${draft.name.trim()} saved`).then(reloadMenu);
  };

  return (
    <>
      <PageTitle
        title={isNew ? 'New dish' : existing!.name}
        subtitle={isNew ? 'It appears on the diner menu as soon as it is saved and available.' : 'Editing a live menu item'}
        action={
          <Link to="/admin/menu" className={ADMIN_GHOST}>
            Back to menu
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <div className="grid gap-4">
          <Panel title="Details">
            <div className="grid gap-4">
              <Field label="Name">
                <TextInput value={draft.name} onChange={(v) => patch('name', v)} maxLength={60} placeholder="Chicken Sekuwa" />
              </Field>

              <Field label="Description" hint="What a diner needs to know before ordering. Two sentences is plenty.">
                <TextArea
                  value={draft.description}
                  onChange={(v) => patch('description', v)}
                  maxLength={300}
                  rows={3}
                  placeholder="Charcoal-grilled, marinated overnight…"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category">
                  <Select
                    value={draft.categoryId}
                    onChange={(v) => patch('categoryId', v)}
                    options={menu.categories.map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }))}
                  />
                </Field>
                <Field label="Price" hint={allows('menu:price') ? 'Changing this is written to the audit log.' : undefined}>
                  <MoneyInput value={draft.price} onChange={(v) => patch('price', v)} currency={menu.restaurant.currency} />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Spice level">
                  <Select
                    value={String(draft.spiceLevel) as '0' | '1' | '2' | '3'}
                    onChange={(v) => patch('spiceLevel', Number(v) as 0 | 1 | 2 | 3)}
                    options={[
                      { value: '0', label: 'Not spicy' },
                      { value: '1', label: '🌶 Mild' },
                      { value: '2', label: '🌶🌶 Hot' },
                      { value: '3', label: '🌶🌶🌶 Very hot' },
                    ]}
                  />
                </Field>
                <div className="self-end">
                  <Toggle checked={draft.isVeg} onChange={(v) => patch('isVeg', v)} label="Vegetarian" />
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Photo" hint="Food is visual — a dish with a photo outsells one without.">
            <div className="flex flex-wrap items-start gap-4">
              <DishImage
                dish={{ imageUrl: draft.imageUrl, name: draft.name || '?' }}
                className="size-28 shrink-0 rounded-2xl"
                monogram="text-2xl"
              />
              <div className="min-w-45 flex-1">
                <Field label="Image URL">
                  <TextInput
                    value={draft.imageUrl ?? ''}
                    onChange={(v) => patch('imageUrl', v.trim() || null)}
                    placeholder="/img/chicken-sekuwa.jpg"
                  />
                </Field>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {library.slice(0, 12).map((url) => (
                    <button
                      key={url}
                      type="button"
                      aria-label={`Use ${url}`}
                      onClick={() => patch('imageUrl', url)}
                      className={cx(
                        'size-10 overflow-hidden rounded-lg ring-1 ring-inset transition-move active:scale-90',
                        draft.imageUrl === url ? 'ring-[1.5px] ring-flame-2' : 'ring-hairline',
                      )}
                    >
                      <img src={url} alt="" className="size-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <div className="grid gap-4">
          <Panel title="On the menu">
            <Toggle
              checked={draft.isAvailable}
              onChange={(v) => patch('isAvailable', v)}
              label="Available today"
              hint="Unavailable dishes stay visible but cannot be ordered."
            />
            <div className="my-1 h-px bg-hairline" />
            <Toggle
              checked={draft.isFeatured}
              onChange={(v) => patch('isFeatured', v)}
              label="Staff pick"
              hint="Adds a badge on the diner menu. Ratings still decide the ranking."
            />
          </Panel>

          {existing && (
            <Panel title="What diners said" hint="Read-only — ratings come from completed orders">
              {existing.stats.ratingCount === 0 ? (
                <p className="py-2 text-[13.5px] text-ink-3">
                  No ratings yet. The diner menu says “Be the first to rate this dish” rather than inventing a score.
                </p>
              ) : (
                <>
                  <div className="mb-4 grid grid-cols-3 gap-3">
                    <Metric label="Rating" value={`${existing.stats.avgRating?.toFixed(2)} ★`} />
                    <Metric label="Reviews" value={String(existing.stats.ratingCount)} />
                    <Metric
                      label="Again"
                      value={existing.stats.recommendRate !== null ? `${Math.round(existing.stats.recommendRate * 100)}%` : '—'}
                    />
                  </div>
                  <RatingBreakdown distribution={existing.stats.distribution} total={existing.stats.ratingCount} />
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Metric label="Orders / 30d" value={String(existing.stats.orders30d)} />
                    <Metric label="Previous 30d" value={String(existing.stats.ordersPrev30d)} />
                  </div>
                  {existing.stats.topTags.length > 0 && (
                    <p className="mt-4 text-[13px] text-ink-3">
                      Most-used words: {existing.stats.topTags.map((t) => `${t.tag} (${t.count})`).join(', ')}
                    </p>
                  )}
                </>
              )}
            </Panel>
          )}

          {existing && !existing.isArchived && canEdit && (
            <Panel title="Archive">
              <p className="mb-3 text-[13px] leading-relaxed text-ink-3">
                Archiving takes {existing.name} off the diner menu but keeps every order that contained it, at the price
                those diners actually paid.
              </p>
              <Confirm
                label="Archive this dish"
                question="Archive it?"
                confirmLabel="Archive"
                onConfirm={() =>
                  void run('archive', () => setDishArchived(staff, existing.id, true), `${existing.name} archived`).then(
                    (ok) => {
                      reloadMenu();
                      if (ok) navigate('/admin/menu');
                    },
                  )
                }
              />
            </Panel>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="sticky bottom-0 z-30 -mx-4 mt-5 flex items-center justify-between gap-3 border-t border-hairline bg-bg/85 px-4 py-3 backdrop-blur-lg sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <span className="text-[13px] text-ink-4">
            {isNew
              ? 'Not saved yet'
              : dirty
                ? 'Unsaved changes'
                : `Live at ${formatMoney(existing!.price, menu.restaurant.currency)}`}
          </span>
          <div className="flex items-center gap-2">
            <Link to="/admin/menu" className={ADMIN_GHOST}>
              Cancel
            </Link>
            <button type="button" className={ADMIN_PRIMARY} disabled={busy || !dirty || draft.name.trim().length < 2} onClick={save}>
              {busy ? 'Saving…' : isNew ? 'Add to menu' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
