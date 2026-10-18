import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
import { suggestPhotos } from '../../api/dishPhotos';
import type { LibraryPhoto } from '../../api/dishPhotos';
import { useAsync } from '../../state/useAsync';
import { fetchDishMargins } from '../../api/dishMargins';
import { IS_LIVE_API } from '../../api/http';
import { INVENTORY_ENABLED } from '../../api/inventory';
import { AutoConsumeChoice, AutoConsumeLockedNote } from '../../components/admin/AutoConsumeChoice';
import { planAllowsAutoStock } from '../../domain/subscription';
import { useSubscription } from '../../state/SubscriptionContext';
import { RecipePanel } from '../../components/admin/RecipePanel';
import { formatMoney } from '../../domain/money';
import type { DietaryType, Dish, DishVariant, MenuCategory } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { DietMarks, DishImage } from '../../components/Bits';
import { ImageUpload } from '../../components/admin/ImageUpload';
import { PhotoPickerDialog } from '../../components/admin/PhotoPickerDialog';
import { RatingBreakdown } from '../../components/Rating';
import {
  ADMIN_GHOST,
  ADMIN_PRIMARY,
  ADMIN_TINY,
  Confirm,
  Field,
  Metric,
  MoneyInput,
  Select,
  TextArea,
  TextInput,
  Toggle,
  useCommand,
} from '../../components/admin/kit';
import { Check, ChevronLeft, ChevronRight, Plus, X } from '../../components/icons';
import { Block, FloatingBar, Num, TiltCard, useAway, useCountUp } from '../../components/admin/profile';
import { DISPLAY, cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/** The form's panels: the customer profile's `Block` material, so both pages share one type and section scale. */
const Panel = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <Block title={title} hint={hint}>
    {children}
  </Block>
);
const CollapsiblePanel = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <details className="group animate-rise rounded-3xl bg-surface px-5 py-5 ring-1 ring-hairline ring-inset sm:px-6">
    <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
      <h2 className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 text-[17px] font-semibold tracking-tight">
        {title}
        {hint && <span className="text-[12.5px] font-normal text-ink-3">{hint}</span>}
      </h2>
      <ChevronRight size={14} className="shrink-0 text-ink-4 transition-transform duration-150 group-open:rotate-90" />
    </summary>
    <div className="mt-4">{children}</div>
  </details>
);

/** The dish as a diner will meet it: a card that previews what is typed, and the headline numbers beside it. */
function DishHero({
  draft,
  existing,
  isNew,
  category,
  currency,
  fromPrice,
  canSave,
  busy,
  onSave,
}: {
  draft: DishDraft;
  existing: Dish | null;
  isNew: boolean;
  category: MenuCategory | null;
  currency: string;
  /** The cheapest variant, when the dish is priced per variant. */
  fromPrice: number | null;
  canSave: boolean;
  busy: boolean;
  onSave: () => void;
}) {
  const heroRef = useRef<HTMLElement>(null);
  const away = useAway(heroRef);
  const stats = existing?.stats;
  const rated = !!stats && stats.ratingCount > 0;
  const rating = useCountUp(Math.round((stats?.avgRating ?? 0) * 100), 1300);
  const reviews = useCountUp(stats?.ratingCount ?? 0);
  const orders = useCountUp(stats?.orders30d ?? 0);
  const price = useCountUp(fromPrice ?? draft.price, 500);
  const hue = [...(category?.name ?? draft.name)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 40);
  const name = draft.name.trim() || (isNew ? 'New dish' : existing!.name);
  const state = existing?.isArchived ? 'Archived' : isNew ? 'Draft' : draft.isAvailable ? 'On the menu' : 'Sold out';
  const hasPhoto = !!draft.imageUrl;
  const trend = stats && stats.ordersPrev30d > 0 ? Math.round(((stats.orders30d - stats.ordersPrev30d) / stats.ordersPrev30d) * 100) : null;

  return (
    <>
      <FloatingBar show={away}>
        <span className="truncate text-[14px] font-semibold">{name}</span>
        <span className="shrink-0 text-[12.5px] text-ink-3">{state}</span>
        {canSave ? (
          <button type="button" disabled={busy} onClick={onSave} className="inline-flex h-8 items-center rounded-full bg-flame px-3.5 text-[13px] font-semibold text-white disabled:opacity-50">
            {busy ? 'Saving…' : isNew ? 'Add to menu' : 'Save'}
          </button>
        ) : (
          <Link to="/admin/menu" className="inline-flex h-8 items-center rounded-full bg-surface-2 px-3.5 text-[13px] font-semibold ring-1 ring-hairline ring-inset">
            Menu
          </Link>
        )}
      </FloatingBar>

      <Link to="/admin/menu" className="mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink">
        <ChevronLeft size={15} /> Menu
      </Link>

      <section ref={heroRef} className="grid items-center gap-8 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-14">
        <TiltCard hue={hue}>
          {hasPhoto && (
            <>
              <DishImage dish={{ imageUrl: draft.imageUrl, name }} className="absolute inset-0 size-full rounded-none" monogram="text-6xl" eager />
              <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/25" />
            </>
          )}
          {!hasPhoto && (
            <span aria-hidden className="absolute -bottom-10 -right-2 select-none font-display text-[200px] font-black leading-none opacity-[0.14]">
              {name[0]}
            </span>
          )}
          <div className={cx('relative flex h-full flex-col justify-between', hasPhoto && 'text-white')}>
            <div className="flex items-start justify-between gap-3 text-[12px] font-bold uppercase tracking-[0.12em]">
              <span className="truncate opacity-80">
                {category ? `${category.emoji} ${category.name}` : 'No category'}
              </span>
              <span className="shrink-0 opacity-90">{state}</span>
            </div>
            <div>
              <p className={cx(DISPLAY, 'text-[clamp(24px,7vw,30px)] leading-[1.05]')}>{name}</p>
              <p className="mt-2 flex items-baseline justify-between gap-3 tnum">
                <span className="text-[22px] font-bold">
                  {fromPrice !== null && <span className="mr-1 text-[12px] font-semibold uppercase tracking-[0.1em] opacity-80">from</span>}
                  {formatMoney(price, currency)}
                </span>
                {rated && <span className="text-[14px] font-semibold opacity-90">{(rating / 100).toFixed(1)} ★</span>}
              </p>
            </div>
          </div>
        </TiltCard>

        <div className="min-w-0">
          <h1 className={cx(DISPLAY, 'animate-rise wrap-break-word text-[clamp(38px,6.4vw,70px)] leading-[0.98] tracking-[-0.03em]')}>{name}</h1>
          <p className="mt-5 max-w-[34ch] animate-rise text-[clamp(20px,2.6vw,28px)] font-medium leading-[1.3] text-ink-2 [animation-delay:80ms] sm:max-w-[40ch]">
            {isNew ? (
              <>Diners see this card on the menu as soon as it is saved and available.</>
            ) : rated ? (
              <>
                <Num>{(rating / 100).toFixed(2)} ★</Num> from <Num>{reviews}</Num> {reviews === 1 ? 'diner' : 'diners'}
                {stats.recommendRate !== null ? <>, and <Num>{Math.round(stats.recommendRate * 100)}%</Num> would order it again</> : null}.{' '}
                <Num>{orders}</Num> orders in the last 30 days{trend !== null ? <> — {trend >= 0 ? 'up' : 'down'} <Num>{Math.abs(trend)}%</Num></> : null}.
              </>
            ) : (
              <>
                No ratings yet. <Num>{orders}</Num> orders in the last 30 days; the diner menu invites the first rating rather than inventing a score.
              </>
            )}
          </p>
          <p className="mt-4 text-[13.5px] text-ink-3">{isNew ? 'The card on the left previews what you type.' : 'Editing a live menu item. Ratings come from diners and are never editable.'}</p>
        </div>
      </section>
    </>
  );
}

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
  const planAllowsStockUse = planAllowsAutoStock(useSubscription().subscription);
  const act = (key: string, action: () => Promise<unknown>, message: string) => void run(key, action, message).then(reloadMenu);

  const existing = dishId === 'new' ? null : menu.dishes.find((d) => d.id === dishId);
  // What the recipe costs at today's purchase prices — only the owner's view of costs, so a role without it just gets no hint.
  const recipeCost = useAsync(() => (IS_LIVE_API && existing && allows('inventory:view') ? fetchDishMargins().then((m) => m.rows.find((r) => r.dishId === existing.id)?.recipeCost ?? null) : Promise.resolve(null)), [existing?.id]).data;
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
    autoConsumeStock: existing?.autoConsumeStock ?? null,
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
      <Panel title="Dish not found">
        <p className="py-4 text-center text-[14px] text-ink-3">
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
    (draft.autoConsumeStock ?? null) !== (existing.autoConsumeStock ?? null) ||
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
      <DishHero
        draft={draft}
        existing={existing ?? null}
        isNew={isNew}
        category={menu.categories.find((c) => c.id === draft.categoryId) ?? null}
        currency={menu.restaurant.currency}
        fromPrice={variantCount > 0 ? Math.min(...(isNew ? stagedVariants.map((v) => v.price) : liveVariants.map((v) => v.price))) : null}
        canSave={canEdit && dirty && draft.name.trim().length >= 2}
        busy={busy}
        onSave={save}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <div className="grid gap-6">
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
                  <Field label="Price" hint={[recipeCost != null && draft.price > 0 ? `Costs about ${formatMoney(recipeCost, menu.restaurant.currency)} to make — ${Math.round(((draft.price - recipeCost) / draft.price) * 100)}% margin at this price.` : null, allows('menu:price') ? 'Changing this is written to the audit log.' : null].filter(Boolean).join(' ') || undefined}>
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
            <div className="grid gap-5 sm:grid-cols-[8rem_1fr]">
              <div className="relative size-32">
                <DishImage
                  dish={{ imageUrl: draft.imageUrl, name: draft.name || '?' }}
                  className="size-32 rounded-2xl ring-1 ring-hairline ring-inset"
                  monogram="text-3xl"
                />
                {draft.imageUrl && (
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => patch('imageUrl', null)}
                    className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-ink/70 text-bg transition-move hover:bg-ink active:scale-90"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="grid content-start gap-3">
                <PhotoSuggestions
                  name={draft.name}
                  value={draft.imageUrl}
                  onPick={(url) => patch('imageUrl', url)}
                  menuPhotos={library}
                  upload={
                    <ImageUpload
                      target="dish"
                      aspect={1}
                      onUploaded={(url) => patch('imageUrl', url)}
                      label={
                        <>
                          <Plus size={16} />
                          Upload
                        </>
                      }
                      className="size-18! flex-col gap-0.5 rounded-xl! border border-dashed border-hairline-strong bg-transparent! px-0! text-[12px]! text-ink-3 ring-0! hover:text-ink"
                    />
                  }
                />
                <PhotoLink value={draft.imageUrl} onChange={(v) => patch('imageUrl', v)} />
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

        <div className="grid gap-6">
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

          {existing && INVENTORY_ENABLED && allows('inventory:view') && (
            <>
              <RecipePanel dish={existing} menu={menu} />
              <Panel title="Stock use" hint="Whether starting this dish takes its recipe off stock">
                {planAllowsStockUse ? (
                  <fieldset disabled={!canEdit} className="disabled:opacity-60">
                    <AutoConsumeChoice value={draft.autoConsumeStock ?? null} onChange={(v) => patch('autoConsumeStock', v)} inheritLabel="Branch setting" />
                    <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">Saved with the dish. Off means stock is never touched for this dish, whatever the branch or restaurant says.</p>
                  </fieldset>
                ) : (
                  <AutoConsumeLockedNote />
                )}
              </Panel>
            </>
          )}

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

/**
 * Library photos for the dish being named. Typing "Chicken Momo" surfaces the
 * photos the platform filed under "Momo" — the fast path for a restaurant with no
 * photographer. Upload sits in the same strip as the last tile: it is just one
 * more way to get a photo, not a second section. "Browse all" opens the whole
 * library in a dialog for when the name matches nothing.
 */
function PhotoSuggestions({
  name,
  value,
  onPick,
  menuPhotos,
  upload,
}: {
  name: string;
  value: string | null;
  onPick: (url: string) => void;
  /** Photos this restaurant already uses on other dishes. */
  menuPhotos: string[];
  upload: ReactNode;
}) {
  const typed = name.trim();
  // The name changes on every keystroke; the library only needs asking once typing pauses.
  const [query, setQuery] = useState(typed);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed), 350);
    return () => clearTimeout(timer);
  }, [typed]);

  const [browsing, setBrowsing] = useState(false);
  const matches = useAsync(() => (query ? suggestPhotos(query) : Promise.resolve<LibraryPhoto[]>([])), [query]);

  const found = matches.data ?? [];

  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] text-ink-3" role="status">
          {!query
            ? 'Name the dish to see matching photos'
            : matches.loading && !matches.data
              ? 'Looking for photos…'
              : found.length > 0
                ? <>Suggested for <span className="font-semibold text-ink">{query}</span></>
                : <>No photo for <span className="font-semibold text-ink">{query}</span> yet</>}
        </p>
        <button type="button" className="text-[12.5px] font-semibold text-ink-3 transition-colors hover:text-ink" aria-haspopup="dialog" onClick={() => setBrowsing(true)}>
          Browse all
        </button>
      </div>

      <PhotoStrip urls={found.map((p) => p.imageUrl)} value={value} onPick={onPick} trailing={upload} />

      {browsing && <PhotoPickerDialog value={value} menuPhotos={menuPhotos} onPick={onPick} onClose={() => setBrowsing(false)} />}
    </div>
  );
}

function PhotoStrip({
  urls,
  value,
  onPick,
  trailing,
}: {
  urls: string[];
  value: string | null;
  onPick: (url: string) => void;
  trailing?: ReactNode;
}) {
  return (
    <ul className="flex flex-wrap gap-2.5">
      {urls.map((url) => {
        const on = url === value;
        return (
          <li key={url}>
            <button
              type="button"
              aria-pressed={on}
              aria-label={on ? 'Selected photo' : 'Use this photo'}
              onClick={() => onPick(url)}
              className={cx(
                'relative block size-18 overflow-hidden rounded-xl transition-move active:scale-95',
                on ? 'ring-2 ring-flame-2 ring-offset-2 ring-offset-docket-surface' : 'ring-1 ring-hairline ring-inset hover:ring-hairline-strong',
              )}
            >
              <img src={url} alt="" className="size-full object-cover" loading="lazy" />
              {on && (
                <span className="absolute right-1 bottom-1 grid size-4.5 place-items-center rounded-full bg-flame text-white" aria-hidden>
                  <Check size={10} />
                </span>
              )}
            </button>
          </li>
        );
      })}
      {trailing && <li>{trailing}</li>}
    </ul>
  );
}

/** Pasting a link is the rare path, so it stays folded away until asked for. */
function PhotoLink({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="justify-self-start text-[12.5px] font-semibold text-ink-3 transition-colors hover:text-ink" onClick={() => setOpen(true)}>
        Use an image link instead
      </button>
    );
  return (
    <TextInput
      autoFocus
      value={value ?? ''}
      onChange={(v) => onChange(v.trim() || null)}
      placeholder="https://…"
    />
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
