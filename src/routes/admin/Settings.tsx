import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listAudit, updateSettings } from '../../api/staff';
import { symbolFor } from '../../domain/money';
import { ROLE_LABEL, ROLE_SCOPE } from '../../domain/permissions';
import type { AuditEntry } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { relativeTime } from '../../components/time';
import { ADMIN_PRIMARY, Field, INPUT_BOX, MoneyInput, PageTitle, Panel, PercentInput, TextArea, TextInput, useCommand } from '../../components/admin/kit';
import { History } from '../../components/icons';
import { cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/**
 * §26 settings, §51 audit log.
 *
 * Fees live here rather than in the checkout code, because a restaurant's
 * service charge is its own business decision and the diner app should never
 * hold a hardcoded copy of it. Changing one is logged, along with every other
 * management action, with the person who made it attached.
 */
export function Settings() {
  const staff = useStaff();
  const { allows } = useAuth();
  const { menu, reloadMenu } = useDashboard();
  const { busy, run } = useCommand();

  const restaurant = menu.restaurant;
  const canEdit = allows('settings:edit');

  const [name, setName] = useState(restaurant.name);
  const [tagline, setTagline] = useState(restaurant.tagline);
  const [description, setDescription] = useState(restaurant.description);
  const [coverImageUrl, setCoverImageUrl] = useState(restaurant.coverImageUrl);
  const [service, setService] = useState((restaurant.serviceChargeRate * 100).toFixed(1));
  const [tax, setTax] = useState((restaurant.taxRate * 100).toFixed(1));
  const [deliveryFee, setDeliveryFee] = useState(restaurant.deliveryFeeAmount ?? 0);

  const audit = useAsync(async () => (await listAudit(staff, 5)).rows, [staff]);

  const dirty =
    name !== restaurant.name ||
    tagline !== restaurant.tagline ||
    description !== restaurant.description ||
    coverImageUrl !== restaurant.coverImageUrl ||
    Number(service) / 100 !== restaurant.serviceChargeRate ||
    Number(tax) / 100 !== restaurant.taxRate ||
    Math.round(Number(deliveryFee) * 100) !== (restaurant.deliveryFeeAmount ?? 0);

  const save = () =>
    void run(
      'settings',
      () =>
        updateSettings(staff, {
          name,
          tagline,
          description,
          coverImageUrl: coverImageUrl.trim() || null,
          serviceChargeRate: Number(service) / 100,
          taxRate: Number(tax) / 100,
          deliveryFeeAmount: deliveryFee,
        }),
      'Settings saved',
    ).then(() => {
      reloadMenu();
      audit.reload();
    });

  return (
    <>
      <PageTitle title="Settings" subtitle={`Signed in as ${staff.name} · ${ROLE_LABEL[staff.role]}`} />

      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr] lg:items-start">
        <div className="grid gap-4">
          <Panel title="Restaurant" hint={canEdit ? undefined : 'Only an owner can change these'}>
            <fieldset disabled={!canEdit} className="grid gap-4 disabled:opacity-60">
              <Field label="Name">
                <TextInput value={name} onChange={setName} maxLength={60} />
              </Field>
              <Field label="Tagline" hint="Shown under the name on the diner menu.">
                <TextInput value={tagline} onChange={setTagline} maxLength={80} />
              </Field>
              <Field label="Description">
                <TextArea value={description} onChange={setDescription} maxLength={400} rows={3} />
              </Field>
            </fieldset>
          </Panel>

          <Panel title="Cover image" hint="Shown at the top of the diner menu">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="h-28 w-full shrink-0 overflow-hidden rounded-2xl ring-1 ring-hairline ring-inset sm:w-44">
                {coverImageUrl ? (
                  <img src={coverImageUrl} alt="" className="size-full object-cover" />
                ) : (
                  <div
                    className="size-full bg-surface-2 bg-[radial-gradient(circle_at_50%_-10%,rgb(255_138_61/0.35),transparent_68%)]"
                    aria-hidden
                  />
                )}
              </div>
              <fieldset disabled={!canEdit} className="min-w-0 flex-1 disabled:opacity-60">
                <Field label="Image URL" hint="A full https:// link to a wide, landscape photo.">
                  <TextInput value={coverImageUrl} onChange={setCoverImageUrl} placeholder="https://…/cover.jpg" maxLength={500} />
                </Field>
              </fieldset>
            </div>
          </Panel>

          <Panel title="Charges" hint="Applied to every order the moment it is placed">
            <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2 disabled:opacity-60">
              <Field label="Service charge" hint="Percent of the subtotal.">
                <PercentInput value={service} onChange={setService} />
              </Field>
              <Field label="Tax" hint="Percent of subtotal plus service charge.">
                <PercentInput value={tax} onChange={setTax} />
              </Field>
              <Field label="Delivery fee" hint="Flat amount added to a delivery order only. Leave at 0 for none.">
                <MoneyInput value={deliveryFee} onChange={setDeliveryFee} currency={restaurant.currency} />
              </Field>
            </fieldset>
            <p className="mt-4 text-[12.5px] leading-relaxed text-ink-4">
              The diner app reads these from the server on every order rather than holding its own copy, so a change
              here applies to the next order placed — including one already sitting in somebody's cart.
            </p>
          </Panel>

          {canEdit && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-ink-4">{dirty ? 'Unsaved changes' : 'Everything saved'}</span>
              <button type="button" className={ADMIN_PRIMARY} disabled={busy || !dirty} onClick={save}>
                {busy ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          )}

          <Panel title="Recent activity" hint="Price changes, availability, menu edits, order status — §51" bare>
            {audit.loading && !audit.data ? (
              <p className="px-5 py-8 text-center text-[13.5px] text-ink-3">Loading…</p>
            ) : (audit.data ?? []).length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] leading-relaxed text-ink-3 sm:px-5">
                Every management action from here on is recorded with who did it and what changed.
              </p>
            ) : (
              <ul>
                {(audit.data ?? []).map((entry) => (
                  <ActivityRow key={entry.id} entry={entry} />
                ))}
              </ul>
            )}
            <Link
              to="/admin/audit"
              className="flex items-center gap-2 border-t border-hairline px-4 py-3 text-[13px] font-semibold text-flame-1 transition-colors hover:text-flame-2 sm:px-5"
            >
              <History size={15} />
              View the full audit log
            </Link>
          </Panel>
        </div>

        <div className="grid gap-4">
          <Panel title="Your access">
            <p className="text-[14px] font-semibold">{ROLE_LABEL[staff.role]}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{ROLE_SCOPE[staff.role]}</p>
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-4">
              Roles are checked twice: the dashboard hides what you cannot use, and the API refuses it again if it is
              called anyway.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}


/** Deliberately quiet — no colour coding here. The full-colour, filterable
 *  version of this same row lives on the dedicated audit page (`AuditLog.tsx`),
 *  which is where a long list actually needs to be scanned at a glance. */
function ActivityRow({ entry }: { entry: AuditEntry }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-hairline px-4 py-2.5 last:border-0 sm:px-5">
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-4">{entry.action.replace(/_/g, ' ')}</span>
      <span className="text-[13.5px] font-semibold">{entry.subject}</span>
      <span className="ml-auto whitespace-nowrap text-[11.5px] text-ink-4">
        {entry.actorName} · {relativeTime(entry.at)}
      </span>
    </li>
  );
}
