import { useState } from 'react';
import { createStaffMember, listStaff } from '../../api/staff';
import { IS_LIVE_API } from '../../api/http';
import { ROLE_LABEL, ROLE_SCOPE } from '../../domain/permissions';
import type { StaffRole } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import {
  ADMIN_PRIMARY,
  Empty,
  Field,
  Loading,
  PageTitle,
  Panel,
  Select,
  TextInput,
  useCommand,
} from '../../components/admin/kit';
import { cx } from '../../components/ui';

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: 'STAFF', label: ROLE_LABEL.STAFF },
  { value: 'MANAGER', label: ROLE_LABEL.MANAGER },
  { value: 'OWNER', label: ROLE_LABEL.OWNER },
];

/**
 * §50 — who's on the team. Adding someone is owner-only, the same gate as
 * settings and fees; everyone who can see Settings can at least see who else
 * is on the roster.
 */
export function Staff() {
  const staff = useStaff();
  const { allows } = useAuth();
  const canEdit = allows('settings:edit');
  const roster = useAsync(() => listStaff(staff), [staff]);
  const { pending, busy, run } = useCommand();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<StaffRole>('STAFF');

  const canSubmit = name.trim().length >= 2 && email.trim().length > 0 && (!IS_LIVE_API || /^\d{4,8}$/.test(pin));

  const submit = () =>
    void run('new', () => createStaffMember(staff, { name, email, pin, role }), `${name.trim()} added to the team`).then(
      (ok) => {
        if (!ok) return;
        setName('');
        setEmail('');
        setPin('');
        setRole('STAFF');
        roster.reload();
      },
    );

  return (
    <>
      <PageTitle title="Staff" subtitle="Everyone with a login to this dashboard." />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <Panel title="Team" bare>
          {roster.loading && !roster.data ? (
            <Loading />
          ) : (roster.data ?? []).length === 0 ? (
            <Empty emoji="🧑‍🍳" title="Nobody on the roster yet" message="Add the first member of the team." />
          ) : (
            <ul>
              {(roster.data ?? []).map((member) => (
                <li key={member.id} className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-0 sm:px-5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[13px] font-semibold uppercase">
                    {member.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold">
                      {member.name}
                      {member.id === staff.id && <span className="ml-1.5 font-normal text-ink-4">(you)</span>}
                    </span>
                    <span className="block truncate text-[12.5px] text-ink-4">{member.email}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-ink-3 ring-1 ring-hairline ring-inset">
                    {ROLE_LABEL[member.role]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {canEdit ? (
          <Panel title="Add a staff member">
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <Field label="Name">
                <TextInput value={name} onChange={setName} maxLength={120} placeholder="Anita Gurung" />
              </Field>
              <Field label="Work email" hint="If they already work at another restaurant on the platform, this links to that account.">
                <TextInput value={email} onChange={setEmail} type="email" maxLength={180} placeholder="anita@sekuwaghar.np" />
              </Field>
              {IS_LIVE_API && (
                <Field label="PIN" hint="4 to 8 digits — what they'll sign in with.">
                  <TextInput
                    value={pin}
                    onChange={(next) => setPin(next.replace(/\D/g, ''))}
                    type="password"
                    maxLength={8}
                    placeholder="••••"
                    className={cx('tnum')}
                  />
                </Field>
              )}
              <Field label="Role" hint={ROLE_SCOPE[role]}>
                <Select value={role} onChange={setRole} options={ROLE_OPTIONS} />
              </Field>
              <button type="submit" className={ADMIN_PRIMARY} disabled={busy || !canSubmit}>
                {pending === 'new' ? 'Adding…' : 'Add to the team'}
              </button>
            </form>
          </Panel>
        ) : (
          <Panel title="Add a staff member" hint="Only an owner can add people to the team">
            <p className="text-[12.5px] leading-relaxed text-ink-4">
              Ask {ROLE_LABEL.OWNER.toLowerCase()} to invite someone new.
            </p>
          </Panel>
        )}
      </div>
    </>
  );
}
