import { useEffect, useRef, useState } from 'react';
import { fetchRecipe, fetchIngredients, formatQty, saveRecipe } from '../../api/inventory';
import type { RecipeLine } from '../../api/inventory';
import type { Dish, Menu } from '../../domain/types';
import { useAuth } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { ADMIN_GHOST, ADMIN_PRIMARY, Confirm, Field, INPUT_BOX, Loading, Panel, Select, useCommand } from './kit';
import { ChevronRight, Plus, X } from '../icons';
import { DISPLAY, cx } from '../ui';
import { useDiscardBack } from './useDiscardBack';

type Ingredient = { id: string; name: string; unit: string };

/** What has to be picked for a line to count: 'base' (always), `v:<variantId>` or `a:<addOnId>`. */
const toApplies = (l: Pick<RecipeLine, 'variantId' | 'addOnId'>) => (l.variantId ? `v:${l.variantId}` : l.addOnId ? `a:${l.addOnId}` : 'base');

const sameSlot = (a: RecipeLine, b: RecipeLine) => a.ingredientId === b.ingredientId && toApplies(a) === toApplies(b);

/**
 * What one portion of a dish uses. Each ingredient is its own entry: the list shows what it is, how
 * much, and which size or add-on it applies to; tapping one (or "Add") opens a modal to change just
 * that line. Stock comes off these quantities when the kitchen starts the dish, and the dish sells
 * out on its own once its base recipe can't be made. A dish with no recipe stays on its manual
 * "Available today" switch.
 */
export function RecipePanel({ dish, menu }: { dish: Dish; menu: Menu }) {
  const { allows } = useAuth();
  const canManage = allows('inventory:manage');
  const ingredients = useAsync(fetchIngredients, []);
  const recipe = useAsync(() => fetchRecipe(dish.id), [dish.id]);

  // Only the first load replaces the panel; a refresh after a save updates the list in place.
  if ((ingredients.loading && !ingredients.data) || (recipe.loading && !recipe.data)) {
    return (
      <Panel title="Recipe">
        <Loading />
      </Panel>
    );
  }
  return <RecipeList dish={dish} menu={menu} saved={recipe.data ?? []} ingredients={ingredients.data ?? []} canManage={canManage} onSaved={recipe.reload} />;
}

function RecipeList({ dish, menu, saved, ingredients, canManage, onSaved }: { dish: Dish; menu: Menu; saved: RecipeLine[]; ingredients: Ingredient[]; canManage: boolean; onSaved: () => void }) {
  const { busy, run } = useCommand();
  // `index` of the line being changed; -1 is a new one; null is no modal.
  const [editing, setEditing] = useState<number | null>(null);

  const variants = dish.variants.filter((v) => !v.isArchived);
  const addOns = menu.addOns.filter((a) => dish.addOnIds.includes(a.id));
  const appliesOptions = [
    { value: 'base', label: 'Always' },
    ...variants.map((v) => ({ value: `v:${v.id}`, label: `Only ${v.name}` })),
    ...addOns.map((a) => ({ value: `a:${a.id}`, label: `Only with ${a.name}` })),
  ];
  // Without sizes or add-ons every line is "always", so saying so on each row is noise.
  const conditional = appliesOptions.length > 1;
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const tag = (l: RecipeLine) => (l.variantId ? (variants.find((v) => v.id === l.variantId)?.name ?? 'A removed size') : l.addOnId ? `With ${addOns.find((a) => a.id === l.addOnId)?.name ?? 'a removed add-on'}` : 'Always');

  /** Saves the whole recipe with one line added, changed or removed: the server keeps a recipe as a set. */
  const commit = (lines: RecipeLine[], message: string) =>
    void run('recipe', () => saveRecipe(dish.id, lines), message).then((ok) => {
      if (!ok) return;
      setEditing(null);
      onSaved();
    });
  const upsert = (index: number, line: RecipeLine) => commit(index === -1 ? [...saved, line] : saved.map((l, i) => (i === index ? line : l)), index === -1 ? 'Ingredient added' : 'Ingredient saved');
  const remove = (index: number) => commit(saved.filter((_, i) => i !== index), 'Ingredient removed');

  const line = editing !== null && editing >= 0 ? saved[editing] : undefined;

  return (
    <Panel
      title="Recipe"
      hint="Per portion. Stock comes off when the kitchen starts the dish."
      action={
        canManage && ingredients.length > 0 ? (
          <button type="button" className="inline-flex items-center gap-1 text-[13px] font-semibold text-flame-1" onClick={() => setEditing(-1)}>
            <Plus size={14} /> Add
          </button>
        ) : undefined
      }
    >
      {ingredients.length === 0 ? (
        <p className="text-[13px] text-ink-3">Add ingredients on the Stock page first.</p>
      ) : saved.length === 0 ? (
        <p className="text-[13px] text-ink-3">No ingredients yet, so this dish stays on its own “Available today” switch.</p>
      ) : (
        <ul className="-my-1 max-h-80 overflow-y-auto">
          {saved.map((l, i) => {
            const ing = byId.get(l.ingredientId);
            const body = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">{ing?.name ?? 'Removed ingredient'}</span>
                  {conditional && <span className={cx('block truncate text-[12px]', l.variantId || l.addOnId ? 'text-flame-1' : 'text-ink-4')}>{tag(l)}</span>}
                </span>
                <span className="shrink-0 text-[13.5px] tnum text-ink-2">{formatQty(l.quantity, ing?.unit ?? 'g')}</span>
                {canManage && <ChevronRight size={14} className="shrink-0 text-ink-4" />}
              </>
            );
            const row = 'flex w-full items-center gap-2.5 py-2 text-left';
            return (
              <li key={`${l.ingredientId}:${toApplies(l)}`} className="border-t border-hairline first:border-0">
                {canManage ? (
                  <button type="button" onClick={() => setEditing(i)} aria-label={`${ing?.name ?? 'Ingredient'}, ${formatQty(l.quantity, ing?.unit ?? 'g')}${conditional ? `, ${tag(l)}` : ''}. Edit`} className={cx(row, 'transition-colors hover:bg-surface-2/50')}>
                    {body}
                  </button>
                ) : (
                  <div className={row}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing !== null && (
        <LineModal
          // A fresh modal per line, so it always opens on that line's values.
          key={editing}
          initial={line}
          ingredients={ingredients}
          appliesOptions={appliesOptions}
          conditional={conditional}
          taken={(candidate) => saved.some((l, i) => i !== editing && sameSlot(l, candidate))}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(next) => upsert(editing, next)}
          onRemove={editing >= 0 ? () => remove(editing) : undefined}
        />
      )}
    </Panel>
  );
}

/** One ingredient of the recipe, added or changed on its own. Native <dialog>: focus trap, Esc and backdrop come with it. */
function LineModal({
  initial,
  ingredients,
  appliesOptions,
  conditional,
  taken,
  busy,
  onClose,
  onSave,
  onRemove,
}: {
  initial?: RecipeLine;
  ingredients: Ingredient[];
  appliesOptions: { value: string; label: string }[];
  conditional: boolean;
  /** True when another line already uses this ingredient for the same size or add-on. */
  taken: (line: RecipeLine) => boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (line: RecipeLine) => void;
  onRemove?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useDiscardBack();
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);
  const [ingredientId, setIngredientId] = useState(initial?.ingredientId ?? '');
  const [applies, setApplies] = useState(initial ? toApplies(initial) : 'base');
  const [quantity, setQuantity] = useState<number | ''>(initial?.quantity ?? '');

  const unit = ingredients.find((i) => i.id === ingredientId)?.unit;
  const candidate: RecipeLine = {
    ingredientId,
    variantId: applies.startsWith('v:') ? applies.slice(2) : null,
    addOnId: applies.startsWith('a:') ? applies.slice(2) : null,
    quantity: Number(quantity),
  };
  const duplicate = Boolean(ingredientId) && taken(candidate);
  const ready = Boolean(ingredientId) && Boolean(quantity) && !duplicate;
  const close = () => ref.current?.close();

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && close()}
      aria-label={initial ? 'Edit ingredient' : 'Add ingredient'}
      className="m-auto w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl bg-surface p-0 text-ink shadow-deep outline-none backdrop:bg-black/55 backdrop:backdrop-blur-[2px]"
    >
      <form
        className="grid gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onSave(candidate);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className={cx(DISPLAY, 'text-[22px]')}>{initial ? 'Edit ingredient' : 'Add ingredient'}</h2>
          <button type="button" aria-label="Close" onClick={close} className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset transition-move hover:text-ink active:scale-90">
            <X size={16} />
          </button>
        </div>

        <Field label="Ingredient">
          <Select value={ingredientId} onChange={setIngredientId} options={[{ value: '', label: 'Choose…' }, ...ingredients.map((i) => ({ value: i.id, label: i.name }))]} />
        </Field>
        <Field label="Used per portion">
          <span className="relative block">
            <input
              className={cx(INPUT_BOX, 'tnum', unit && 'pr-12')}
              inputMode="numeric"
              value={quantity}
              placeholder="0"
              autoFocus={!initial}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                setQuantity(digits === '' ? '' : Number.parseInt(digits, 10));
              }}
            />
            {unit && <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[13px] font-semibold text-ink-4">{unit}</span>}
          </span>
        </Field>
        {conditional && (
          <Field label="Used when" hint="Always counts for every portion. Pick a size or add-on to count it only when that is chosen.">
            <Select value={applies} onChange={setApplies} options={appliesOptions} />
          </Field>
        )}
        {duplicate && <p className="rounded-xl bg-berry/10 px-3.5 py-2.5 text-[13px] text-berry-ink ring-1 ring-berry/25 ring-inset">This ingredient is already in the recipe for that. Change its amount instead.</p>}

        <div className="flex items-center gap-2 pt-1">
          <button type="submit" disabled={busy || !ready} className={cx(ADMIN_PRIMARY, 'h-11 flex-1')}>
            {initial ? 'Save' : 'Add to recipe'}
          </button>
          {onRemove && <Confirm label="Remove" question="Remove it?" confirmLabel="Remove" disabled={busy} onConfirm={onRemove} />}
          {!onRemove && (
            <button type="button" className={cx(ADMIN_GHOST, 'h-11')} onClick={close}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
