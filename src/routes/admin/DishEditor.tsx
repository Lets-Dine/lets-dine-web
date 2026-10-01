import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createDish,
  createDishVariant,
  setDishArchived,
  setDishAddOns,
  setDishVariantArchived,
  updateDish,
  updateDishVariant,
} from '../../api/staff';
import type { DishDraft } from '../../api/admin';
import { formatMoney } from '../../domain/money';
import type { DietaryType, DishVariant } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { DietMarks, DishImage } from '../../components/Bits';
import { ImageUpload } from '../../components/admin/ImageUpload';
import { RatingBreakdown } from '../../components/Rating';
import {
  ADMIN_GHOST,
  ADMIN_PRIMARY,
  ADMIN_TINY,
  CollapsiblePanel,
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
import { Check } from '../../components/icons';
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
  const { pending, busy, run } = useCommand();
  const act = (key: string, action: () => Promise<unknown>, message: string) => void run(key, action, message).then(reloadMenu);

  const existing = dishId === 'new' ? null : menu.dishes.find((d) => d.id === dishId);
  const isNew = dishId === 'new';

  const [draft, setDraft] = useState<DishDraft>(() => ({
    name: existing?.name ?? '',
    description: existing?.description ?? '',
    categoryId: existing?.categoryId ?? menu.categories[0]?.id ?? '',
    price: existing?.price ?? 0,
    imageUrl: existing?.imageUrl ?? null,
    dietaryType: existing?.dietaryType ?? 'NON_VEG',
    spiceLevel: existing?.spiceLevel ?? 0,
    isAvailable: existing?.isAvailable ?? true,
    isFeatured: existing?.isFeatured ?? false,
  }));
  const [addOnIds, setAddOnIds] = useState<string[]>(() => existing?.addOnIds ?? []);
  const toggleAddOn = (id: string) =>
    setAddOnIds((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));

  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [variantName, setVariantName] = useState('');
  const [variantPrice, setVariantPrice] = useState(0);
  const [variantSpiceLevel, setVariantSpiceLevel] = useState<0 | 1 | 2 | 3>(0);
  const [variantDietaryType, setVariantDietaryType] = useState<DietaryType>('NON_VEG');
  const liveVariants = useMemo(
    () => [...(existing?.variants ?? [])].filter((v) => !v.isArchived).sort((a, b) => a.sortOrder - b.sortOrder),
    [existing],
  );
  const archivedVariants = useMemo(
    () => [...(existing?.variants ?? [])].filter((v) => v.isArchived).sort((a, b) => a.sortOrder - b.sortOrder),
    [existing],
  );

  // A new dish has no id yet, so a variant can't be attached to it via the API — staged
  // locally instead, and created right after the dish itself on save (§ below).
  const [stagedVariants, setStagedVariants] = useState<
    { tempId: string; name: string; price: number; spiceLevel: 0 | 1 | 2 | 3; dietaryType: DietaryType }[]
  >([]);
  const variantCount = isNew ? stagedVariants.length : liveVariants.length;

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
  const addOnIdsChanged = [...addOnIds].sort().join(',') !== [...(existing?.addOnIds ?? [])].sort().join(',');
  const dirty =
    !existing ||
    draft.name !== existing.name ||
    draft.description !== existing.description ||
    draft.categoryId !== existing.categoryId ||
    draft.price !== existing.price ||
    draft.imageUrl !== existing.imageUrl ||
    draft.dietaryType !== existing.dietaryType ||
    draft.spiceLevel !== existing.spiceLevel ||
    draft.isAvailable !== existing.isAvailable ||
    draft.isFeatured !== existing.isFeatured ||
    addOnIdsChanged;

  const save = () => {
    if (isNew) {
      void run(
        'save',
        async () => {
          const created = await createDish(staff, draft);
          if (addOnIds.length > 0) await setDishAddOns(staff, created.id, addOnIds);
          // Sequential, not Promise.all — each variant's sort order is assigned by
          // arrival order server-side, so they need to land in the order staged.
          for (const v of stagedVariants) {
            await createDishVariant(staff, created.id, {
              name: v.name,
              price: v.price,
              isAvailable: true,
              spiceLevel: v.spiceLevel,
              dietaryType: v.dietaryType,
            });
          }
        },
        `${draft.name.trim()} added to the menu`,
      ).then((ok) => {
        reloadMenu();
        if (ok) navigate('/admin/menu');
      });
      return;
    }
    void run('save', async () => {
      await updateDish(staff, existing!.id, draft);
      if (addOnIdsChanged) await setDishAddOns(staff, existing!.id, addOnIds);
    }, `${draft.name.trim()} saved`).then(reloadMenu);
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
        <div className="grid gap-2">
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
                {variantCount === 0 && (
                  <Field label="Price" hint={allows('menu:price') ? 'Changing this is written to the audit log.' : undefined}>
                    <MoneyInput value={draft.price} onChange={(v) => patch('price', v)} currency={menu.restaurant.currency} />
                  </Field>
                )}
              </div>

              {/* Once a dish has a variant, its price/spice level/dietary type come from the
                  variant chosen at order time — the dish's own values are unused, so they're
                  hidden here rather than left editable and misleading. */}
              {variantCount > 0 ? (
                <p className="text-[13px] text-ink-3">
                  Price, spice level, and dietary type are set per variant, below — this dish has{' '}
                  {variantCount} of them.
                </p>
              ) : (
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
                  <Field label="Dietary type">
                    <Select
                      value={draft.dietaryType}
                      onChange={(v) => patch('dietaryType', v)}
                      options={[
                        { value: 'NON_VEG', label: 'Non-veg' },
                        { value: 'VEG', label: 'Vegetarian' },
                        { value: 'VEGAN', label: 'Vegan' },
                        { value: 'HALAL', label: 'Halal' },
                      ]}
                    />
                  </Field>
                </div>
              )}
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
                <Field label="Photo" hint="Upload a photo, or paste an image URL below.">
                  <ImageUpload target="dish" aspect={1} label="Upload photo" onUploaded={(url) => patch('imageUrl', url)} />
                </Field>
                <Field label="Image URL" className="mt-3">
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

          <CollapsiblePanel
            title="Variants"
            hint={
              isNew
                ? 'Optional — sizes, styles, anything with its own price. Created together with the dish.'
                : 'A required choice that changes this dish’s price — sizes, styles, anything you like.'
            }
          >
            <div className="grid gap-2">
              {isNew ? (
                <>
                  {stagedVariants.length === 0 && (
                    <p className="py-1 text-[13px] text-ink-3">
                      No variants staged. If this dish comes in different sizes, styles, or any other priced choice,
                      add them below — they're created together with the dish. Otherwise leave it as a single price.
                    </p>
                  )}
                  {stagedVariants.map((variant) => (
                    <div
                      key={variant.tempId}
                      className="flex items-center gap-3 rounded-xl bg-surface-2 px-3.5 py-2.5 ring-1 ring-hairline ring-inset"
                    >
                      <span className="min-w-0 flex-1 text-[13.5px] font-semibold">
                        {variant.name}
                        <DietMarks dish={variant} />
                      </span>
                      <span className="text-[13px] tnum text-ink-3">{formatMoney(variant.price, menu.restaurant.currency)}</span>
                      <button
                        type="button"
                        className={cx(ADMIN_TINY, 'bg-surface-2 ring-1 ring-hairline ring-inset')}
                        onClick={() => setStagedVariants((prev) => prev.filter((v) => v.tempId !== variant.tempId))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <form
                    className="mt-1 flex flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (variantName.trim().length < 1) return;
                      setStagedVariants((prev) => [
                        ...prev,
                        {
                          tempId: crypto.randomUUID(),
                          name: variantName.trim(),
                          price: variantPrice,
                          spiceLevel: variantSpiceLevel,
                          dietaryType: variantDietaryType,
                        },
                      ]);
                      setVariantName('');
                      setVariantPrice(0);
                      setVariantSpiceLevel(0);
                      setVariantDietaryType('NON_VEG');
                    }}
                  >
                    <input
                      className="min-w-30 flex-1 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[14.5px] outline-none ring-1 ring-hairline ring-inset placeholder:text-ink-4 focus:ring-[1.5px] focus:ring-flame-2/40"
                      value={variantName}
                      maxLength={40}
                      placeholder="Large, Jhol, Spicy…"
                      aria-label="Variant name"
                      onChange={(e) => setVariantName(e.target.value)}
                    />
                    <span className="w-32 shrink-0">
                      <MoneyInput value={variantPrice} onChange={setVariantPrice} currency={menu.restaurant.currency} />
                    </span>
                    <VariantOptionFields
                      spiceLevel={variantSpiceLevel}
                      onSpiceLevel={setVariantSpiceLevel}
                      dietaryType={variantDietaryType}
                      onDietaryType={setVariantDietaryType}
                    />
                    <button type="submit" className={ADMIN_PRIMARY} disabled={variantName.trim().length < 1}>
                      Add variant
                    </button>
                  </form>
                </>
              ) : (
                <>
                  {liveVariants.length === 0 && archivedVariants.length === 0 && (
                    <p className="py-1 text-[13px] text-ink-3">
                      No variants yet. Add one below if diners should choose between priced options — like sizes or
                      styles — before this can be ordered. Otherwise leave it as a single-price dish.
                    </p>
                  )}

                  {liveVariants.map((variant) =>
                    editingVariantId === variant.id ? (
                      <VariantEditor
                        key={variant.id}
                        variant={variant}
                        currency={menu.restaurant.currency}
                        busy={busy}
                        onCancel={() => setEditingVariantId(null)}
                        onSave={(nextName, nextPrice, nextSpiceLevel, nextDietaryType) => {
                          setEditingVariantId(null);
                          act(
                            variant.id,
                            () =>
                              updateDishVariant(staff, existing!.id, variant.id, {
                                name: nextName,
                                price: nextPrice,
                                spiceLevel: nextSpiceLevel,
                                dietaryType: nextDietaryType,
                              }),
                            'Variant updated',
                          );
                        }}
                      />
                    ) : (
                      <div
                        key={variant.id}
                        className={cx(
                          'flex items-center gap-3 rounded-xl bg-surface-2 px-3.5 py-2.5 ring-1 ring-hairline ring-inset',
                          pending === variant.id && 'opacity-50',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-semibold">
                            {variant.name}
                            <DietMarks dish={variant} />
                          </span>
                          {!variant.isAvailable && <span className="block text-[12px] text-ink-3">Unavailable</span>}
                        </span>
                        <span className="text-[13px] tnum text-ink-3">{formatMoney(variant.price, menu.restaurant.currency)}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            className={cx(ADMIN_TINY, variant.isAvailable ? 'bg-surface-3 text-ink' : 'bg-mint/16 text-mint')}
                            onClick={() =>
                              act(
                                variant.id,
                                () => updateDishVariant(staff, existing!.id, variant.id, { isAvailable: !variant.isAvailable }),
                                variant.isAvailable ? `${variant.name} marked unavailable` : `${variant.name} is back on`,
                              )
                            }
                          >
                            {variant.isAvailable ? 'Mark unavailable' : 'Put back on'}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className={cx(ADMIN_TINY, 'bg-surface-2 ring-1 ring-hairline ring-inset')}
                            onClick={() => setEditingVariantId(variant.id)}
                          >
                            Edit
                          </button>
                          <Confirm
                            label="Archive"
                            question="Archive it?"
                            confirmLabel="Archive"
                            disabled={busy}
                            onConfirm={() =>
                              act(variant.id, () => setDishVariantArchived(staff, existing!.id, variant.id, true), `${variant.name} archived`)
                            }
                          />
                        </div>
                      </div>
                    ),
                  )}

                  {/* {archivedVariants.length > 0 && (
                    <div className="mt-1 grid gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-4">Archived</span>
                      {archivedVariants.map((variant) => (
                        <div
                          key={variant.id}
                          className={cx(
                            'flex items-center gap-3 rounded-xl px-3.5 py-2.5 opacity-60 ring-1 ring-hairline ring-inset',
                            pending === variant.id && 'opacity-30',
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{variant.name}</span>
                          <span className="text-[13px] tnum text-ink-3">{formatMoney(variant.price, menu.restaurant.currency)}</span>
                          <button
                            type="button"
                            disabled={busy}
                            className={cx(ADMIN_TINY, 'text-mint')}
                            onClick={() =>
                              act(variant.id, () => setDishVariantArchived(staff, existing!.id, variant.id, false), `${variant.name} restored`)
                            }
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  )} */}

                  <form
                    className="mt-1 flex flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      act(
                        'new-variant',
                        () =>
                          createDishVariant(staff, existing!.id, {
                            name: variantName,
                            price: variantPrice,
                            isAvailable: true,
                            spiceLevel: variantSpiceLevel,
                            dietaryType: variantDietaryType,
                          }),
                        `${variantName.trim()} added`,
                      );
                      setVariantName('');
                      setVariantPrice(0);
                      setVariantSpiceLevel(0);
                      setVariantDietaryType('NON_VEG');
                    }}
                  >
                    <input
                      className="min-w-30 flex-1 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[14.5px] outline-none ring-1 ring-hairline ring-inset placeholder:text-ink-4 focus:ring-[1.5px] focus:ring-flame-2/40"
                      value={variantName}
                      maxLength={40}
                      placeholder="Large, Jhol, Spicy…"
                      aria-label="Variant name"
                      onChange={(e) => setVariantName(e.target.value)}
                    />
                    <span className="w-32 shrink-0">
                      <MoneyInput value={variantPrice} onChange={setVariantPrice} currency={menu.restaurant.currency} />
                    </span>
                    <VariantOptionFields
                      spiceLevel={variantSpiceLevel}
                      onSpiceLevel={setVariantSpiceLevel}
                      dietaryType={variantDietaryType}
                      onDietaryType={setVariantDietaryType}
                    />
                    <button type="submit" className={ADMIN_PRIMARY} disabled={busy || variantName.trim().length < 1}>
                      {pending === 'new-variant' ? 'Adding…' : 'Add variant'}
                    </button>
                  </form>
                </>
              )}
            </div>
          </CollapsiblePanel>

          {menu.addOns.some((a) => !a.isArchived) && (
            <CollapsiblePanel title="Add-ons" hint="Extras a diner can add to this dish, each at its own price.">
              <div className="flex flex-wrap gap-2">
                {menu.addOns
                  .filter((a) => !a.isArchived)
                  .map((addOn) => {
                    const on = addOnIds.includes(addOn.id);
                    return (
                      <button
                        key={addOn.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleAddOn(addOn.id)}
                        className={cx(
                          'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-left transition-colors duration-150',
                          on
                            ? 'bg-flame-2/14 ring-[1.5px] ring-flame-2/35 ring-inset'
                            : 'bg-surface-2 ring-1 ring-hairline ring-inset',
                        )}
                      >
                        <span className="flex items-center gap-2.5">
                          <span
                            className={cx(
                              'grid size-5 shrink-0 place-items-center rounded-full text-white',
                              on ? 'bg-flame' : 'ring-[1.5px] ring-hairline-strong ring-inset',
                            )}
                            aria-hidden
                          >
                            {on && <Check size={11} />}
                          </span>
                        </span>
                        <span className="text-[12.5px] font-semibold">{addOn.name}</span>
                        <span className="text-[12px] tnum text-ink-3">{formatMoney(addOn.price, menu.restaurant.currency)}</span>
                      </button>
                    );
                  })}
              </div>
            </CollapsiblePanel>
          )}
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
        <div className="sticky bottom-0 z-30 -mx-4 mt-5 flex items-center justify-between gap-3 border-t border-hairline bg-transparent px-4 py-3 backdrop-blur-lg sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
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

const SPICE_OPTIONS = [
  { value: '0', label: 'Not spicy' },
  { value: '1', label: '🌶 Mild' },
  { value: '2', label: '🌶🌶 Hot' },
  { value: '3', label: '🌶🌶🌶 Very hot' },
] as const;

const DIETARY_OPTIONS = [
  { value: 'NON_VEG', label: 'Non-veg' },
  { value: 'VEG', label: 'Vegetarian' },
  { value: 'VEGAN', label: 'Vegan' },
  { value: 'HALAL', label: 'Halal' },
] as const;

/** A variant's own spice level and dietary type — same choices as the dish's, since a variant is priced and served independently of it. */
function VariantOptionFields({
  spiceLevel,
  onSpiceLevel,
  dietaryType,
  onDietaryType,
}: {
  spiceLevel: 0 | 1 | 2 | 3;
  onSpiceLevel: (v: 0 | 1 | 2 | 3) => void;
  dietaryType: DietaryType;
  onDietaryType: (v: DietaryType) => void;
}) {
  return (
    <>
      <span className="w-36 shrink-0">
        <Select
          value={String(spiceLevel) as '0' | '1' | '2' | '3'}
          onChange={(v) => onSpiceLevel(Number(v) as 0 | 1 | 2 | 3)}
          options={SPICE_OPTIONS as unknown as { value: '0' | '1' | '2' | '3'; label: string }[]}
        />
      </span>
      <span className="w-36 shrink-0">
        <Select value={dietaryType} onChange={onDietaryType} options={DIETARY_OPTIONS as unknown as { value: DietaryType; label: string }[]} />
      </span>
    </>
  );
}

function VariantEditor({
  variant,
  currency,
  busy,
  onSave,
  onCancel,
}: {
  variant: DishVariant;
  currency: string;
  busy: boolean;
  onSave: (name: string, price: number, spiceLevel: 0 | 1 | 2 | 3, dietaryType: DietaryType) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(variant.name);
  const [price, setPrice] = useState(variant.price);
  const [spiceLevel, setSpiceLevel] = useState(variant.spiceLevel);
  const [dietaryType, setDietaryType] = useState(variant.dietaryType);

  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 ring-1 ring-hairline ring-inset"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name, price, spiceLevel, dietaryType);
      }}
    >
      <input
        className="min-w-30 flex-1 rounded-xl bg-surface px-3.5 py-2.5 text-[14.5px] outline-none ring-1 ring-hairline ring-inset placeholder:text-ink-4 focus:ring-[1.5px] focus:ring-flame-2/40"
        value={name}
        maxLength={40}
        aria-label="Variant name"
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />
      <span className="w-32 shrink-0">
        <MoneyInput value={price} onChange={setPrice} currency={currency} />
      </span>
      <VariantOptionFields spiceLevel={spiceLevel} onSpiceLevel={setSpiceLevel} dietaryType={dietaryType} onDietaryType={setDietaryType} />
      <button type="button" className={ADMIN_GHOST} onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className={ADMIN_PRIMARY} disabled={busy || name.trim().length < 1}>
        Save
      </button>
    </form>
  );
}
