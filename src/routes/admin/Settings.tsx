import { useState } from 'react';
import { getSettings, listAudit, restoreSeedMenu, setAutoKitchen, updateSettings } from '../../api/admin';
import { resetDemoData } from '../../api/client';
import { ROLE_LABEL, ROLE_SCOPE } from '../../domain/permissions';
import type { AuditAction, AuditEntry } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { relativeTime } from '../../components/time';
import {
  ADMIN_PRIMARY,
  Confirm,
  Empty,
  Field,
  INPUT_BOX,
  PageTitle,
  Panel,
  TextArea,
  TextInput,
  Toggle,
  useCommand,
} from '../../components/admin/kit';
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
  const [service, setService] = useState((restaurant.serviceChargeRate * 100).toFixed(1));
  const [tax, setTax] = useState((restaurant.taxRate * 100).toFixed(1));
  const settings = useAsync(() => getSettings(staff), [staff]);
  const [kitchenOverride, setKitchen] = useState<boolean | null>(null);
  const autoKitchen = kitchenOverride ?? settings.data?.autoKitchen ?? true;

  const audit = useAsync(() => listAudit(staff, 60), [staff]);

  const dirty =
    name !== restaurant.name ||
    tagline !== restaurant.tagline ||
    description !== restaurant.description ||
    Number(service) / 100 !== restaurant.serviceChargeRate ||
    Number(tax) / 100 !== restaurant.taxRate;

  const save = () =>
    void run(
      'settings',
      () =>
        updateSettings(staff, {
          name,
          tagline,
          description,
          serviceChargeRate: Number(service) / 100,
          taxRate: Number(tax) / 100,
        }),
      'Settings saved',
    ).then(() => {
      reloadMenu();
      audit.reload();
    });

  return (
    <>
      <PageTitle title="Settings" subtitle={`Signed in as ${staff.name} · ${ROLE_LABEL[staff.role]}`} />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr] lg:items-start">
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

          <Panel title="Charges" hint="Applied to every order the moment it is placed">
            <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2 disabled:opacity-60">
              <Field label="Service charge" hint="Percent of the subtotal.">
                <PercentInput value={service} onChange={setService} />
              </Field>
              <Field label="Tax" hint="Percent of subtotal plus service charge.">
                <PercentInput value={tax} onChange={setTax} />
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

          <Panel title="Audit log" hint="Price changes, availability, menu edits, order status — §51" bare>
            {audit.loading && !audit.data ? (
              <p className="px-5 py-8 text-center text-[13.5px] text-ink-3">Loading…</p>
            ) : (audit.data ?? []).length === 0 ? (
              <Empty
                emoji="🗒️"
                title="Nothing logged yet"
                message="Every management action from here on is recorded with who did it and what changed."
              />
            ) : (
              <ul className="max-h-125 overflow-y-auto">
                {(audit.data ?? []).map((entry) => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
              </ul>
            )}
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

          <Panel title="Demo controls" hint="Not part of the product">
            <Toggle
              checked={autoKitchen}
              onChange={(next) => {
                setKitchen(next);
                void run('kitchen', () => setAutoKitchen(staff, next), next ? 'Demo kitchen on' : 'Demo kitchen off');
              }}
              label="Demo kitchen"
              hint="Advances orders placed from this browser's diner app on a timer, so the diner flow works with nobody at the pass. Orders on the restaurant queue always wait for staff."
            />

            {canEdit && (
              <>
                <div className="my-3 h-px bg-hairline" />
                <p className="mb-2 text-[13px] leading-relaxed text-ink-3">
                  Put the menu, categories, tables and settings back to how they shipped. Orders and reviews are kept.
                </p>
                <Confirm
                  label="Restore the original menu"
                  question="Discard menu edits?"
                  confirmLabel="Restore"
                  onConfirm={() =>
                    void run('restore', () => restoreSeedMenu(staff), 'Menu restored to the original').then(() => {
                      reloadMenu();
                      audit.reload();
                    })
                  }
                />

                <div className="my-3 h-px bg-hairline" />
                <p className="mb-2 text-[13px] leading-relaxed text-ink-3">
                  Wipe everything this browser has stored — orders, reviews, carts, the queue and the audit log.
                </p>
                <Confirm
                  label="Reset all demo data"
                  question="Erase everything?"
                  confirmLabel="Erase"
                  onConfirm={() => {
                    resetDemoData();
                    window.location.href = '/admin';
                  }}
                />
              </>
            )}
          </Panel>
        </div>
      </div>
    </>
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

const ACTION_TONE: Partial<Record<AuditAction, string>> = {
  price_changed: 'text-gold',
  availability_changed: 'text-flame-1',
  dish_archived: 'text-berry',
  category_deleted: 'text-berry',
  order_cancelled: 'text-berry',
  qr_regenerated: 'text-berry',
  settings_updated: 'text-flame-1',
};

function AuditRow({ entry }: { entry: AuditEntry }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-hairline px-4 py-2.5 last:border-0 sm:px-5">
      <span className={cx('text-[11px] font-bold uppercase tracking-[0.06em]', ACTION_TONE[entry.action] ?? 'text-ink-4')}>
        {entry.action.replace(/_/g, ' ')}
      </span>
      <span className="text-[13.5px] font-semibold">{entry.subject}</span>
      <span className="text-[13px] text-ink-3">{entry.detail}</span>
      <span className="ml-auto whitespace-nowrap text-[11.5px] text-ink-4">
        {entry.actorName} · {relativeTime(entry.at)}
      </span>
    </li>
  );
}
