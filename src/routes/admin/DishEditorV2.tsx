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
import { ImageUpload } from '../../components/admin/ImageUpload';
import { fetchDishMargins } from '../../api/dishMargins';
import { IS_LIVE_API } from '../../api/http';
import { INVENTORY_ENABLED } from '../../api/inventory';
import { AutoConsumeChoice, AutoConsumeLockedNote } from '../../components/admin/AutoConsumeChoice';
import { RecipePanel } from '../../components/admin/RecipePanel';
import { planAllowsAutoStock } from '../../domain/subscription';
import { useSubscription } from '../../state/SubscriptionContext';
import { useAsync } from '../../state/useAsync';
import { formatMoney } from '../../domain/money';
import type { DietaryType, Dish, KitchenStation } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { DietMarks, DishImage } from '../../components/Bits';
import { RatingBreakdown } from '../../components/Rating';
import {
  ADMIN_GHOST,
  ADMIN_PRIMARY,
  ADMIN_TINY,
  Confirm,
  Field,
  MoneyInput,
  TextArea,
  Toggle,
  useCommand,
} from '../../components/admin/kit';
import { Check, ChevronLeft, Chilli, Plus, X } from '../../components/icons';
import { reduced, useCountUp } from '../../components/admin/profile';
import { DISPLAY, cx } from '../../components/ui';
import { haptic } from '../../platform/haptics';
import { useDashboard } from './AdminLayout';
import { PhotoLink, PhotoSuggestions, VariantEditor, VariantOptionFields } from './DishEditor';

/*
 * Dish editor, take two.
 *
 * Same data, same endpoints, same rules as `DishEditor` — only the arrangement
 * changes. The page is one calm column of five sections (Basics, Photo,
 * Options, Menu, Feedback) with a rail that tracks where you are, boxes
 * replaced by space and hairlines, and everything occasional (adding a
 * variant, pasting an image link, archiving) folded until asked for.
 */

const STATIONS: { value: KitchenStation; label: string }[] = [
  { value: 'KITCHEN', label: 'Kitchen' },
  { value: 'BAR', label: 'Bar' },
];

type Spice = 0 | 1 | 2 | 3;
const SPICE_LABEL = ['Not spicy', 'Mild', 'Hot', 'Very hot'] as const;
const DIET: { value: DietaryType; label: string }[] = [
  { value: 'NON_VEG', label: 'Non-veg' },
  { value: 'VEG', label: 'Vegetarian' },
  { value: 'VEGAN', label: 'Vegan' },
  { value: 'HALAL', label: 'Halal' },
];

/** A row of choices with one pill that glides to the selected one. */
function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative grid rounded-full bg-surface-2 p-1 ring-1 ring-hairline ring-inset"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-full bg-flame shadow-flame transition-transform duration-400 ease-spring"
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${i * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => {
            haptic.select();
            onChange(o.value);
          }}
          className={cx(
            'relative h-9 truncate px-1 text-[12.5px] font-semibold sm:px-2 sm:text-[13px] transition-colors duration-200',
            o.value === value ? 'text-white' : 'text-ink-3 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Tap the third chilli and the first two light with it; tap the lit one again to cool down a step. */
function SpiceMeter({ value, onChange }: { value: Spice; onChange: (v: Spice) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div role="radiogroup" aria-label="Spice level" className="flex gap-1">
        {([1, 2, 3] as const).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={SPICE_LABEL[n]}
            onClick={() => {
              haptic.tick();
              onChange(value === n ? ((n - 1) as Spice) : n);
            }}
            className={cx(
              'grid size-10 place-items-center rounded-full transition-[color,background-color,scale] duration-300 ease-spring active:scale-90',
              n <= value ? 'scale-105 bg-[#ff6b4a]/15 text-[#ff6b4a]' : 'text-ink-4 hover:bg-surface-2',
            )}
          >
            <Chilli size={20} />
          </button>
        ))}
      </div>
      <span className="text-[13.5px] font-medium text-ink-2" aria-live="polite">
        {SPICE_LABEL[value]}
      </span>
    </div>
  );
}

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section id={id} data-section className="scroll-mt-24 border-t border-hairline py-10 first:border-t-0 first:pt-0">
      <h2 className={cx(DISPLAY, 'text-[26px]')}>{title}</h2>
      {hint && <p className="mt-1.5 max-w-[56ch] text-[14px] leading-relaxed text-ink-3">{hint}</p>}
      <div className="mt-7">{children}</div>
    </section>
  );
}

/** Folds open with a height transition instead of popping in. */
function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={cx('grid transition-[grid-template-rows,opacity] duration-400 ease-out-quart', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
      <div className="min-h-0 overflow-hidden" inert={!open}>
        {children}
      </div>
    </div>
  );
}

/** The "add a variant" form, closed to a single line until wanted. Shared by new and existing dishes. */
function VariantAdd({
  currency,
  busy,
  onAdd,
}: {
  currency: string;
  busy: boolean;
  onAdd: (v: { name: string; price: number; spiceLevel: Spice; dietaryType: DietaryType }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  const [spiceLevel, setSpiceLevel] = useState<Spice>(0);
  const [dietaryType, setDietaryType] = useState<DietaryType>('NON_VEG');
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="group inline-flex items-center gap-2 text-[14px] font-semibold text-flame-1"
      >
        <span className="grid size-6 place-items-center rounded-full bg-flame-2/15 transition-transform duration-300 ease-spring group-hover:scale-110">
          <Plus size={14} className={cx('transition-transform duration-300 ease-spring', open && 'rotate-45')} />
        </span>
        {open ? 'Never mind' : 'Add a variant'}
      </button>
      <Reveal open={open}>
        <form
          className="flex flex-wrap items-center gap-2 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length < 1) return;
            onAdd({ name: name.trim(), price, spiceLevel, dietaryType });
            setName('');
            setPrice(0);
            setSpiceLevel(0);
            setDietaryType('NON_VEG');
            setOpen(false);
          }}
        >
          <input
            className="min-w-30 flex-1 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[14.5px] outline-none ring-1 ring-hairline ring-inset placeholder:text-ink-4 focus:ring-[1.5px] focus:ring-flame-2/40"
            value={name}
            maxLength={40}
            placeholder="Large, Jhol, Spicy…"
            aria-label="Variant name"
            onChange={(e) => setName(e.target.value)}
          />
          <span className="w-32 shrink-0">
            <MoneyInput value={price} onChange={setPrice} currency={currency} />
          </span>
          <VariantOptionFields spiceLevel={spiceLevel} onSpiceLevel={setSpiceLevel} dietaryType={dietaryType} onDietaryType={setDietaryType} />
          <button type="submit" className={ADMIN_PRIMARY} disabled={busy || name.trim().length < 1}>
            Add
          </button>
        </form>
      </Reveal>
    </div>
  );
}

/** One dish, everything about it — see the note at the top of this file for what differs from `DishEditor`. */
export function DishEditorV2() {
  const { dishId } = useParams();
  const staff = useStaff();
  const { allows } = useAuth();
  const navigate = useNavigate();
  const { menu, reloadMenu } = useDashboard();
  const { pending, busy, run } = useCommand();
  const planAllowsStockUse = planAllowsAutoStock(useSubscription().subscription);
  const act = (key: string, action: () => Promise<unknown>, message: string) => void run(key, action, message).then(reloadMenu);

  const isNew = dishId === 'new';
  const existing: Dish | null | undefined = isNew ? null : menu.dishes.find((d) => d.id === dishId);
  const currency = menu.restaurant.currency;
  const recipeCost = useAsync(
    () =>
      IS_LIVE_API && existing && allows('inventory:view')
        ? fetchDishMargins().then((m) => m.rows.find((r) => r.dishId === existing.id)?.recipeCost ?? null)
        : Promise.resolve(null),
    [existing?.id],
  ).data;

  const [draft, setDraft] = useState<DishDraft>(() => ({
    name: existing?.name ?? '',
    description: existing?.description ?? '',
    categoryId: existing?.categoryId ?? menu.categories[0]?.id ?? '',
    price: existing?.price ?? 0,
    imageUrl: existing?.imageUrl ?? null,
    dietaryType: existing?.dietaryType ?? 'NON_VEG',
    station: existing?.station ?? 'KITCHEN',
    spiceLevel: existing?.spiceLevel ?? 0,
    isAvailable: existing?.isAvailable ?? true,
    isFeatured: existing?.isFeatured ?? false,
    autoConsumeStock: existing?.autoConsumeStock ?? null,
  }));
  const patch = <K extends keyof DishDraft>(key: K, value: DishDraft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));

  const [addOnIds, setAddOnIds] = useState<string[]>(() => existing?.addOnIds ?? []);
  const toggleAddOn = (id: string) => setAddOnIds((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));

  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const liveVariants = useMemo(
    () => [...(existing?.variants ?? [])].filter((v) => !v.isArchived).sort((a, b) => a.sortOrder - b.sortOrder),
    [existing],
  );
  // A new dish has no id for variants to attach to, so they're staged here and created right after it on save.
  const [stagedVariants, setStagedVariants] = useState<
    { tempId: string; name: string; price: number; spiceLevel: Spice; dietaryType: DietaryType }[]
  >([]);
  const variantCount = isNew ? stagedVariants.length : liveVariants.length;

  const library = useMemo(
    () => [...new Set(menu.dishes.map((d) => d.imageUrl).filter((url): url is string => Boolean(url)))],
    [menu.dishes],
  );

  const [justSaved, setJustSaved] = useState(false);
  const [active, setActive] = useState('basics');
  const saveRef = useRef<() => void>(() => {});

  const canEdit = allows('menu:edit');
  const showKitchen = !!existing && INVENTORY_ENABLED && allows('inventory:view');
  const sections = [
    { id: 'basics', label: 'Basics' },
    { id: 'photo', label: 'Photo' },
    { id: 'options', label: 'Options' },
    { id: 'menu', label: 'On the menu' },
    ...(showKitchen ? [{ id: 'kitchen', label: 'Kitchen' }] : []),
    ...(existing ? [{ id: 'feedback', label: 'Feedback' }] : []),
  ];

  // Scroll-spy: the rail highlights whichever section is crossing the upper third of the screen.
  const sectionKey = sections.map((s) => s.id).join();
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>('[data-section]')];
    if (els.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-25% 0px -65% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sectionKey, existing?.id]);

  // ⌘S / Ctrl+S saves, as in any editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const rating = useCountUp(Math.round((existing?.stats.avgRating ?? 0) * 100), 1200);
  const orders = useCountUp(existing?.stats.orders30d ?? 0);
  const shownPrice = useCountUp(variantCount > 0 ? Math.min(...(isNew ? stagedVariants.map((v) => v.price) : liveVariants.map((v) => v.price))) : draft.price, 450);

  if (!isNew && !existing)
    return (
      <p className="py-16 text-center text-[14px] text-ink-3">
        That dish is no longer on the menu.{' '}
        <Link to="/admin/menu" className="font-semibold text-flame-1">
          Back to the menu
        </Link>
      </p>
    );

  const addOnIdsChanged = [...addOnIds].sort().join(',') !== [...(existing?.addOnIds ?? [])].sort().join(',');
  const dirty =
    !existing ||
    draft.name !== existing.name ||
    draft.description !== existing.description ||
    draft.categoryId !== existing.categoryId ||
    draft.price !== existing.price ||
    draft.imageUrl !== existing.imageUrl ||
    draft.dietaryType !== existing.dietaryType ||
    draft.station !== (existing.station ?? 'KITCHEN') ||
    draft.spiceLevel !== existing.spiceLevel ||
    draft.isAvailable !== existing.isAvailable ||
    draft.isFeatured !== existing.isFeatured ||
    (draft.autoConsumeStock ?? null) !== (existing.autoConsumeStock ?? null) ||
    addOnIdsChanged;
  const canSave = canEdit && dirty && draft.name.trim().length >= 2 && !busy;

  const flashSaved = () => {
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1800);
  };

  const save = () => {
    if (!canSave) return;
    if (isNew) {
      void run(
        'save',
        async () => {
          const created = await createDish(staff, draft);
          if (addOnIds.length > 0) await setDishAddOns(staff, created.id, addOnIds);
          // Sequential: each variant's sort order is assigned by arrival order server-side.
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
      ).then((ok) => {
        reloadMenu();
        if (ok) navigate('/admin/menu');
      });
      return;
    }
    void run(
      'save',
      async () => {
        await updateDish(staff, existing!.id, draft);
        if (addOnIdsChanged) await setDishAddOns(staff, existing!.id, addOnIds);
      },
    ).then((ok) => {
      reloadMenu();
      if (ok) flashSaved();
    });
  };
  saveRef.current = save;

  const category = menu.categories.find((c) => c.id === draft.categoryId) ?? null;
  const state = existing?.isArchived ? 'Archived' : isNew ? 'Draft' : draft.isAvailable ? 'On the menu' : 'Sold out';
  const stateDot = existing?.isArchived || (!isNew && !draft.isAvailable) ? 'bg-ink-4' : isNew ? 'bg-gold' : 'bg-mint';
  const stats = existing?.stats;
  const rated = !!stats && stats.ratingCount > 0;
  const trend = stats && stats.ordersPrev30d > 0 ? Math.round(((stats.orders30d - stats.ordersPrev30d) / stats.ordersPrev30d) * 100) : null;
  const margin = recipeCost != null && draft.price > 0 && variantCount === 0 ? Math.round(((draft.price - recipeCost) / draft.price) * 100) : null;
  const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  const availableAddOns = menu.addOns.filter((a) => !a.isArchived);
  const hue = [...(category?.name ?? draft.name)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 40);

  return (
    <div className="mx-auto w-full max-w-5xl pb-28">
      <Link to="/admin/menu" className="mb-6 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 transition-colors hover:text-ink">
        <ChevronLeft size={15} /> Menu
      </Link>

      {/* ── Masthead: the dish as it will read, name editable in place ── */}
      <header className="mb-10 flex animate-rise items-center gap-5 sm:gap-7">
        <div className="group relative shrink-0">
          {draft.imageUrl ? (
            <DishImage
              dish={{ imageUrl: draft.imageUrl, name: draft.name || '?' }}
              className="size-20 rounded-3xl ring-1 ring-hairline ring-inset transition-transform duration-500 ease-spring group-hover:-rotate-3 group-hover:scale-105 sm:size-28"
            />
          ) : (
            // No photo yet: a tile tinted from the dish itself, legible on both themes (the stock placeholder washes out on light).
            <div
              aria-hidden
              className="grid size-20 place-items-center rounded-3xl font-display text-4xl font-bold transition-transform duration-500 ease-spring group-hover:-rotate-3 group-hover:scale-105 sm:size-28 sm:text-5xl"
              style={{
                background: `linear-gradient(145deg, oklch(0.9 0.085 ${hue}), oklch(0.8 0.12 ${(hue + 28) % 360}))`,
                color: `oklch(0.32 0.08 ${hue})`,
              }}
            >
              {(draft.name.trim()[0] ?? '?').toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="dish-name">
            Dish name
          </label>
          <input
            id="dish-name"
            value={draft.name}
            maxLength={60}
            placeholder="Name this dish"
            onChange={(e) => patch('name', e.target.value)}
            className={cx(
              DISPLAY,
              'w-full border-b border-transparent bg-transparent pb-1 text-[clamp(28px,5vw,46px)] tracking-[-0.02em] outline-none transition-colors duration-200 placeholder:text-ink-4 hover:border-hairline-strong focus:border-flame-2',
            )}
          />
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-ink-3">
            <span className="inline-flex items-center gap-2">
              <span className={cx('size-2 rounded-full', stateDot)} aria-hidden />
              {state}
            </span>
            {category && (
              <span>
                {category.emoji} {category.name}
              </span>
            )}
            <span className="tnum text-ink-2">
              {variantCount > 0 && 'from '}
              {formatMoney(shownPrice, currency)}
            </span>
            {rated && <span className="tnum">{(rating / 100).toFixed(1)} ★</span>}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-14 lg:grid-cols-[9.5rem_minmax(0,1fr)]">
        {/* ── Rail: where you are, and a way to jump ── */}
        <nav aria-label="Sections" className="min-w-0 -mx-4 mb-6 px-4 sm:-mx-6 sm:px-6 lg:sticky lg:top-24 lg:z-20 lg:mx-0 lg:mb-0 lg:self-start lg:p-0">
          <ul className="no-scrollbar flex gap-1 overflow-x-auto py-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:py-0">
            {sections.map((s) => (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  aria-current={active === s.id ? 'true' : undefined}
                  onClick={() => goTo(s.id)}
                  className={cx(
                    'relative flex h-9 w-full items-center whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-semibold transition-colors duration-200 lg:rounded-xl lg:pl-4',
                    active === s.id ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:text-ink',
                  )}
                >
                  <span
                    aria-hidden
                    className={cx(
                      'absolute left-0 hidden h-4 w-0.5 rounded-full bg-flame transition-[opacity,scale] duration-300 ease-spring lg:block',
                      active === s.id ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0',
                    )}
                  />
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          <fieldset disabled={!canEdit} className="contents">
            {/* ── Basics ── */}
            <Section id="basics" title="Basics" hint="What a diner reads before ordering. Two sentences is plenty.">
              <div className="grid gap-6">
                <Field label="Description">
                  <TextArea value={draft.description} onChange={(v) => patch('description', v)} maxLength={300} rows={3} placeholder="Charcoal-grilled, marinated overnight…" />
                </Field>

                <div className="grid gap-6 sm:grid-cols-2">
                  <Field label="Category">
                    <div className="flex flex-wrap gap-2">
                      {menu.categories.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={c.id === draft.categoryId}
                          onClick={() => {
                            haptic.select();
                            patch('categoryId', c.id);
                          }}
                          className={cx(
                            'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-[color,background-color,scale] duration-200 active:scale-95',
                            c.id === draft.categoryId ? 'bg-flame text-white shadow-flame' : 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset hover:bg-surface-3',
                          )}
                        >
                          {c.emoji} {c.name}
                        </button>
                      ))}
                    </div>
                  </Field>

                  {variantCount === 0 ? (
                    <Field label="Price" hint={allows('menu:price') ? 'Changing this is written to the audit log.' : undefined}>
                      <MoneyInput value={draft.price} onChange={(v) => patch('price', v)} currency={currency} />
                      {margin !== null && recipeCost != null && (
                        <div className="mt-3" aria-label={`${margin}% margin`}>
                          <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-3">
                            <span
                              className="block h-full bg-ink-4 transition-[width] duration-700 ease-out-quart"
                              style={{ width: `${Math.min(100, Math.max(0, (recipeCost / draft.price) * 100))}%` }}
                            />
                            <span className={cx('block h-full flex-1', margin >= 0 ? 'bg-mint' : 'bg-berry')} />
                          </div>
                          <p className="mt-1.5 text-[12.5px] text-ink-3 tnum">
                            Costs about {formatMoney(recipeCost, currency)} to make — <span className={margin >= 0 ? 'text-mint' : 'text-berry'}>{margin}% margin</span>.
                          </p>
                        </div>
                      )}
                    </Field>
                  ) : (
                    <p className="self-end text-[13px] leading-relaxed text-ink-3">
                      Price, spice and dietary type are set per variant — this dish has {variantCount}.
                    </p>
                  )}
                </div>

                {variantCount === 0 && (
                  <div className="grid gap-6 sm:grid-cols-2">
                    <Field label="Spice level">
                      <SpiceMeter value={draft.spiceLevel as Spice} onChange={(v) => patch('spiceLevel', v)} />
                    </Field>
                    <Field label="Dietary type">
                      <Segmented label="Dietary type" value={draft.dietaryType} onChange={(v) => patch('dietaryType', v)} options={DIET} />
                    </Field>
                    <Field label="Prepared at">
                      <Segmented label="Prepared at" value={draft.station ?? 'KITCHEN'} onChange={(v) => patch('station', v)} options={STATIONS} />
                    </Field>
                  </div>
                )}
              </div>
            </Section>

            {/* ── Photo ── */}
            <Section id="photo" title="Photo" hint="Food is visual — a dish with a photo outsells one without.">
              <div className="grid gap-6 sm:grid-cols-[11rem_minmax(0,1fr)]">
                <div className="relative aspect-square w-44 max-sm:w-full max-sm:max-w-60">
                  <DishImage
                    key={draft.imageUrl ?? 'none'}
                    dish={{ imageUrl: draft.imageUrl, name: draft.name || '?' }}
                    monogram="text-5xl"
                    className="size-full animate-pop rounded-3xl ring-1 ring-hairline ring-inset"
                  />
                  {draft.imageUrl && (
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={() => patch('imageUrl', null)}
                      className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-ink/70 text-bg transition-move hover:bg-ink active:scale-90"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="grid content-start gap-3">
                  <PhotoSuggestions
                    name={draft.name}
                    value={draft.imageUrl}
                    onPick={(url) => {
                      haptic.select();
                      patch('imageUrl', url);
                    }}
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
            </Section>

            {/* ── Options: variants and add-ons ── */}
            <Section
              id="options"
              title="Options"
              hint={isNew ? 'Optional. Sizes, styles, extras — created together with the dish.' : 'Variants change what a diner pays; add-ons are extras on top.'}
            >
              <div className="grid gap-9">
                <div>
                  <h3 className="mb-3 text-[13px] font-semibold text-ink-3">Variants</h3>
                  {variantCount === 0 && (
                    <p className="mb-4 max-w-[52ch] text-[13.5px] leading-relaxed text-ink-3">
                      None yet. Add one if diners should pick between priced options before ordering; otherwise this stays a single-price dish.
                    </p>
                  )}
                  <ul className="mb-4 divide-y divide-hairline">
                    {isNew &&
                      stagedVariants.map((v) => (
                        <li key={v.tempId} className="flex animate-rise flex-wrap items-center gap-x-3 gap-y-2 py-3">
                          <span className="min-w-0 flex-1 text-[14.5px] font-semibold">
                            {v.name}
                            <DietMarks dish={v} />
                          </span>
                          <span className="text-[13.5px] tnum text-ink-3">{formatMoney(v.price, currency)}</span>
                          <button type="button" className={cx(ADMIN_TINY, 'bg-surface-2 ring-1 ring-hairline ring-inset')} onClick={() => setStagedVariants((p) => p.filter((x) => x.tempId !== v.tempId))}>
                            Remove
                          </button>
                        </li>
                      ))}
                    {!isNew &&
                      liveVariants.map((v) =>
                        editingVariantId === v.id ? (
                          <li key={v.id} className="py-3">
                            <VariantEditor
                              variant={v}
                              currency={currency}
                              busy={busy}
                              onCancel={() => setEditingVariantId(null)}
                              onSave={(name, price, spiceLevel, dietaryType) => {
                                setEditingVariantId(null);
                                act(v.id, () => updateDishVariant(staff, existing!.id, v.id, { name, price, spiceLevel, dietaryType }), 'Variant updated');
                              }}
                            />
                          </li>
                        ) : (
                          <li key={v.id} className={cx('group flex animate-rise flex-wrap items-center gap-x-3 gap-y-2 py-3 transition-opacity', pending === v.id && 'opacity-50')}>
                            <span className="min-w-0 flex-1">
                              <span className={cx('block text-[14.5px] font-semibold', !v.isAvailable && 'text-ink-3')}>
                                {v.name}
                                <DietMarks dish={v} />
                              </span>
                              {!v.isAvailable && <span className="block text-[12px] text-ink-4">Unavailable</span>}
                            </span>
                            <span className="text-[13.5px] tnum text-ink-3">{formatMoney(v.price, currency)}</span>
                            {canEdit && (
                              <span className="flex shrink-0 items-center gap-1 transition-opacity max-sm:basis-full lg:opacity-0 lg:focus-within:opacity-100 lg:group-hover:opacity-100">
                                <button
                                  type="button"
                                  disabled={busy}
                                  className={cx(ADMIN_TINY, v.isAvailable ? 'bg-surface-3 text-ink' : 'bg-mint/16 text-mint')}
                                  onClick={() =>
                                    act(
                                      v.id,
                                      () => updateDishVariant(staff, existing!.id, v.id, { isAvailable: !v.isAvailable }),
                                      v.isAvailable ? `${v.name} marked unavailable` : `${v.name} is back on`,
                                    )
                                  }
                                >
                                  {v.isAvailable ? 'Mark unavailable' : 'Put back on'}
                                </button>
                                <button type="button" disabled={busy} className={cx(ADMIN_TINY, 'bg-surface-2 ring-1 ring-hairline ring-inset')} onClick={() => setEditingVariantId(v.id)}>
                                  Edit
                                </button>
                                <Confirm
                                  label="Archive"
                                  question="Archive it?"
                                  confirmLabel="Archive"
                                  disabled={busy}
                                  onConfirm={() => act(v.id, () => setDishVariantArchived(staff, existing!.id, v.id, true), `${v.name} archived`)}
                                />
                              </span>
                            )}
                          </li>
                        ),
                      )}
                  </ul>
                  {canEdit && (
                    <VariantAdd
                      currency={currency}
                      busy={busy}
                      onAdd={(v) =>
                        isNew
                          ? setStagedVariants((prev) => [...prev, { tempId: crypto.randomUUID(), ...v }])
                          : act('new-variant', () => createDishVariant(staff, existing!.id, { ...v, isAvailable: true }), `${v.name} added`)
                      }
                    />
                  )}
                </div>

                {availableAddOns.length > 0 && (
                  <div>
                    <h3 className="mb-3 flex items-baseline gap-2 text-[13px] font-semibold text-ink-3">
                      Add-ons
                      <span className="font-normal text-ink-4 tnum">
                        {addOnIds.length} of {availableAddOns.length} attached
                      </span>
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {availableAddOns.map((a) => {
                        const on = addOnIds.includes(a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => {
                              haptic.select();
                              toggleAddOn(a.id);
                            }}
                            className={cx(
                              'inline-flex h-10 items-center gap-2 rounded-full pl-2.5 pr-3.5 text-[13px] font-semibold transition-[color,background-color,box-shadow,scale] duration-200 active:scale-95',
                              on ? 'bg-flame-2/14 text-ink ring-[1.5px] ring-flame-2/40 ring-inset' : 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset hover:bg-surface-3',
                            )}
                          >
                            <span
                              aria-hidden
                              className={cx(
                                'grid size-5 place-items-center rounded-full text-white transition-[background-color,scale] duration-300 ease-spring',
                                on ? 'scale-110 bg-flame' : 'scale-100 ring-[1.5px] ring-hairline-strong ring-inset',
                              )}
                            >
                              <Check size={11} className={cx('transition-opacity duration-150', on ? 'opacity-100' : 'opacity-0')} />
                            </span>
                            {a.name}
                            <span className="font-normal tnum text-ink-3">{formatMoney(a.price, currency)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </Section>

            {/* ── On the menu ── */}
            <Section id="menu" title="On the menu" hint="How this dish shows up for diners right now.">
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    { key: 'isAvailable', label: 'Available today', hint: 'Unavailable dishes stay visible but cannot be ordered.' },
                    { key: 'isFeatured', label: 'Staff pick', hint: 'Adds a badge on the diner menu. Ratings still decide the ranking.' },
                  ] as const
                ).map((t) => (
                  <div
                    key={t.key}
                    className={cx(
                      'rounded-2xl px-4 py-3 transition-[background-color,box-shadow] duration-300',
                      draft[t.key] ? 'bg-flame-2/10 ring-1 ring-flame-2/30 ring-inset' : 'bg-surface ring-1 ring-hairline ring-inset',
                    )}
                  >
                    <Toggle checked={draft[t.key]} onChange={(v) => patch(t.key, v)} label={t.label} hint={t.hint} disabled={!canEdit} />
                  </div>
                ))}
              </div>

              {existing && !existing.isArchived && canEdit && (
                <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-6">
                  <p className="max-w-[50ch] text-[13px] leading-relaxed text-ink-3">
                    Archiving takes {existing.name} off the diner menu but keeps every order that contained it, at the price those diners actually paid.
                  </p>
                  <Confirm
                    label="Archive this dish"
                    question="Archive it?"
                    confirmLabel="Archive"
                    onConfirm={() =>
                      void run('archive', () => setDishArchived(staff, existing.id, true), `${existing.name} archived`).then((ok) => {
                        reloadMenu();
                        if (ok) navigate('/admin/menu');
                      })
                    }
                  />
                </div>
              )}
            </Section>

            {/* ── Kitchen ── */}
            {showKitchen && existing && (
              <Section id="kitchen" title="Kitchen" hint="What this dish is made of, and whether starting it takes that off stock.">
                <div className="grid gap-8">
                  <RecipePanel dish={existing} menu={menu} />
                  <div>
                    <h3 className="mb-3 text-[13px] font-semibold text-ink-3">Stock use</h3>
                    {planAllowsStockUse ? (
                      <div>
                        <AutoConsumeChoice value={draft.autoConsumeStock ?? null} onChange={(v) => patch('autoConsumeStock', v)} inheritLabel="Branch setting" />
                        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">Saved with the dish. Off means stock is never touched for this dish, whatever the branch or restaurant says.</p>
                      </div>
                    ) : (
                      <AutoConsumeLockedNote />
                    )}
                  </div>
                </div>
              </Section>
            )}
          </fieldset>

          {/* ── Feedback: read-only, never editable ── */}
          {existing && stats && (
            <Section id="feedback" title="Feedback" hint="Read-only — ratings come from completed orders and are never editable.">
              {!rated ? (
                <p className="max-w-[52ch] text-[14px] leading-relaxed text-ink-3">
                  No ratings yet. The diner menu says “Be the first to rate this dish” rather than inventing a score.
                </p>
              ) : (
                <div className="grid gap-8 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                  <div>
                    <span className={cx(DISPLAY, 'block text-[64px] leading-none tracking-tighter tnum')}>{(rating / 100).toFixed(1)}</span>
                    <span className="mt-2 block text-[13px] text-ink-3 tnum">
                      from {stats.ratingCount.toLocaleString('en-US')} {stats.ratingCount === 1 ? 'diner' : 'diners'}
                    </span>
                    {stats.recommendRate !== null && (
                      <span className="mt-3 block text-[13px] text-ink-3">
                        <b className="text-mint tnum">{Math.round(stats.recommendRate * 100)}%</b> would order it again
                      </span>
                    )}
                    <span className="mt-3 block text-[13px] text-ink-3 tnum">
                      <b className="text-ink">{orders}</b> orders in 30 days
                      {trend !== null && (
                        <span className={trend >= 0 ? 'text-mint' : 'text-berry'}>
                          {' '}
                          · {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="grid content-start gap-5">
                    <RatingBreakdown distribution={stats.distribution} total={stats.ratingCount} />
                    {stats.topTags.length > 0 && (
                      <p className="text-[13px] leading-relaxed text-ink-3">
                        Most-used words: {stats.topTags.map((t) => `${t.tag} (${t.count})`).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </Section>
          )}
        </div>
      </div>

      {/* ── Save bar: only exists while there is something to save ── */}
      {canEdit && (
        <div
          className={cx(
            'fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 transition-[transform,opacity] duration-500 ease-spring',
            dirty || justSaved || busy ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-8 opacity-0',
          )}
        >
          <div className="flex w-full max-w-lg items-center gap-3 rounded-full bg-surface-2/90 py-2 pl-5 pr-2 shadow-deep ring-1 ring-hairline-strong ring-inset backdrop-blur-xl">
            <span className="flex min-w-0 flex-1 items-center gap-2.5 truncate text-[13.5px] text-ink-2">
              <span aria-hidden className={cx('size-2 shrink-0 rounded-full', justSaved ? 'bg-mint' : 'animate-breathe bg-gold')} />
              {justSaved ? 'Saved' : isNew ? 'Not saved yet' : 'Unsaved changes'}
            </span>
            <Link to="/admin/menu" className={cx(ADMIN_GHOST, 'h-9 px-3.5')}>
              {isNew ? 'Cancel' : 'Leave'}
            </Link>
            <button type="button" className={cx(ADMIN_PRIMARY, 'relative h-9 overflow-hidden px-4')} disabled={!canSave && !justSaved} onClick={save}>
              <span aria-hidden className={cx('absolute inset-0 origin-left bg-mint transition-transform duration-500 ease-out-quart', justSaved ? 'scale-x-100' : 'scale-x-0')} />
              <span className="relative inline-flex items-center gap-1.5">
                {justSaved ? (
                  <>
                    <Check size={15} /> Saved
                  </>
                ) : busy ? (
                  'Saving…'
                ) : isNew ? (
                  'Add to menu'
                ) : (
                  'Save'
                )}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
