import { useMemo, useState } from 'react';
import { ApiError } from '../../api/store';
import { clearPlatformKey, listPlatformRestaurants, registerRestaurant } from '../../api/platform';
import type { PlatformRestaurant, RegisterRestaurantInput } from '../../api/platform';
import { Navigate } from 'react-router-dom';
import { useAsync } from '../../state/useAsync';
import {
  ADMIN_PRIMARY,
  Empty,
  Field,
  Loading,
  INPUT_BOX,
  PageTitle,
  Panel,
  TextArea,
  TextInput,
  useCommand,
} from '../../components/admin/kit';
import { Search } from '../../components/icons';
import { cx } from '../../components/ui';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const emptyForm = {
  name: '',
  slug: '',
  tagline: '',
  description: '',
  currency: 'NPR',
  timezone: 'Asia/Kathmandu',
  service: '10',
  tax: '13',
  ownerName: '',
  ownerEmail: '',
  ownerPin: '',
};

/**
 * The thin platform console: every restaurant on the service, and the form
 * that creates the next one together with its first OWNER account.
 */
export function PlatformRestaurants() {
  const [keyword, setKeyword] = useState('');
  const list = useAsync(() => listPlatformRestaurants(keyword), [keyword]);
  const { busy, run } = useCommand();
  const [form, setForm] = useState(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);

  if (list.error instanceof ApiError && list.error.status === 401) {
    clearPlatformKey();
    return <Navigate to="/platform/signin" replace />;
  }

  const rows = list.data?.rows ?? [];
  const count = list.data?.count ?? 0;

  const set = <K extends keyof typeof emptyForm>(key: K, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'name' && !slugTouched) next.slug = slugify(value);
      return next;
    });
  };

  const ready = useMemo(() => {
    const slugOk = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug);
    const pinOk = /^\d{4,8}$/.test(form.ownerPin);
    const emailOk = form.ownerEmail.includes('@');
    return Boolean(form.name.trim() && slugOk && form.ownerName.trim() && emailOk && pinOk);
  }, [form]);

  const submit = () => {
    const payload: RegisterRestaurantInput = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      tagline: form.tagline.trim() || undefined,
      description: form.description.trim() || undefined,
      currency: form.currency.trim().toUpperCase() || undefined,
      timezone: form.timezone.trim() || undefined,
      serviceChargeRate: Number(form.service) / 100,
      taxRate: Number(form.tax) / 100,
      owner: {
        name: form.ownerName.trim(),
        email: form.ownerEmail.trim(),
        pin: form.ownerPin.trim(),
      },
    };
    void run(
      'register',
      () => registerRestaurant(payload),
      `Restaurant created. ${form.ownerName.trim()} can sign in at the restaurant dashboard.`,
    ).then((ok) => {
      if (!ok) return;
      setForm(emptyForm);
      setSlugTouched(false);
      list.reload();
    });
  };

  return (
    <>
      <PageTitle
        title="Restaurants"
        subtitle={count === 1 ? '1 restaurant on the platform' : `${count} restaurants on the platform`}
      />

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <Panel
          title="On the platform"
          hint="Search by name or slug"
          action={
            <label className="relative block w-44">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
              <input
                className={cx(INPUT_BOX, 'h-8 py-0 pl-7 text-[13px]')}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Search"
                aria-label="Search restaurants"
              />
            </label>
          }
          bare
        >
          {list.loading && !list.data ? (
            <Loading label="Loading restaurants…" />
          ) : list.error && !list.data ? (
            <p className="px-4 py-6 text-[13.5px] text-berry sm:px-5">{list.error.message}</p>
          ) : rows.length === 0 ? (
            <Empty title="No restaurants yet" message="Add the first one with an owner on the right." />
          ) : (
            <ul>
              {rows.map((restaurant) => (
                <RestaurantRow key={restaurant.id} restaurant={restaurant} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Add a restaurant" hint="Creates the restaurant and its first owner in one step">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready && !busy) submit();
            }}
          >
            <Field label="Restaurant name">
              <TextInput value={form.name} onChange={(v) => set('name', v)} maxLength={120} placeholder="Newa Kitchen" />
            </Field>
            <Field label="Slug" hint="Lowercase letters, numbers and dashes. Used in diner URLs.">
              <TextInput
                value={form.slug}
                onChange={(v) => {
                  setSlugTouched(true);
                  set('slug', v.toLowerCase());
                }}
                maxLength={80}
                placeholder="newa-kitchen"
              />
            </Field>
            <Field label="Tagline">
              <TextInput value={form.tagline} onChange={(v) => set('tagline', v)} maxLength={160} placeholder="Charcoal grill & Newari kitchen" />
            </Field>
            <Field label="Description">
              <TextArea value={form.description} onChange={(v) => set('description', v)} maxLength={2000} rows={3} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency">
                <TextInput value={form.currency} onChange={(v) => set('currency', v.toUpperCase())} maxLength={3} placeholder="NPR" />
              </Field>
              <Field label="Timezone">
                <TextInput value={form.timezone} onChange={(v) => set('timezone', v)} maxLength={60} placeholder="Asia/Kathmandu" />
              </Field>
              <Field label="Service charge">
                <PercentInput value={form.service} onChange={(v) => set('service', v)} />
              </Field>
              <Field label="Tax">
                <PercentInput value={form.tax} onChange={(v) => set('tax', v)} />
              </Field>
            </div>

            <div className="border-t border-hairline pt-4">
              <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-4">Owner</p>
              <div className="grid gap-4">
                <Field label="Name">
                  <TextInput value={form.ownerName} onChange={(v) => set('ownerName', v)} maxLength={120} placeholder="Ranjana Shrestha" />
                </Field>
                <Field label="Email">
                  <TextInput value={form.ownerEmail} onChange={(v) => set('ownerEmail', v)} type="email" placeholder="owner@restaurant.np" />
                </Field>
                <Field label="PIN" hint="4 to 8 digits. Used to sign in to the restaurant dashboard.">
                  <TextInput value={form.ownerPin} onChange={(v) => set('ownerPin', v.replace(/\D/g, '').slice(0, 8))} type="password" maxLength={8} placeholder="••••" />
                </Field>
              </div>
            </div>

            <button type="submit" disabled={busy || !ready} className={cx(ADMIN_PRIMARY, 'h-11 w-full')}>
              {busy ? 'Creating…' : 'Create restaurant'}
            </button>
          </form>
        </Panel>
      </div>
    </>
  );
}

function RestaurantRow({ restaurant }: { restaurant: PlatformRestaurant }) {
  const fees = [
    restaurant.serviceChargeRate > 0 ? `${Math.round(restaurant.serviceChargeRate * 100)}% service` : null,
    restaurant.taxRate > 0 ? `${Math.round(restaurant.taxRate * 100)}% tax` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="flex items-start gap-3 border-b border-hairline px-4 py-3.5 last:border-0 sm:px-5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-flame-dim text-[12px] font-bold text-flame-1">
        {restaurant.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate text-[14.5px] font-semibold">{restaurant.name}</span>
          <span className="text-[12px] text-ink-4">/{restaurant.slug}</span>
        </span>
        {restaurant.tagline && <span className="mt-0.5 block truncate text-[13px] text-ink-3">{restaurant.tagline}</span>}
        <span className="mt-1 block text-[12px] text-ink-4">
          {restaurant.currency} · {restaurant.timezone}
          {fees ? ` · ${fees}` : ''}
          {restaurant.isActive ? '' : ' · inactive'}
        </span>
      </span>
      <span
        className={cx(
          'mt-1 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em]',
          restaurant.isActive ? 'bg-mint/16 text-mint-ink' : 'bg-ink/8 text-ink-3',
        )}
      >
        {restaurant.isActive ? 'Active' : 'Off'}
      </span>
    </li>
  );
}

function PercentInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <span className="relative block">
      <input
        className={cx(INPUT_BOX, 'pr-9 tnum')}
        value={value}
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[13.5px] font-semibold text-ink-4">
        %
      </span>
    </span>
  );
}
