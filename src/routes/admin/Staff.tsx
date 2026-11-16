import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BRANCHES_ENABLED, createStaffMember, listBranches, listStaff } from '../../api/staff';
import { IS_LIVE_API } from '../../api/http';
import { ROLE_LABEL, ROLE_SCOPE } from '../../domain/permissions';
import { phoneError } from '../../domain/phone';
import type { BranchRef, StaffRole } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { ADMIN_GHOST, Empty, Field, Loading, PageTitle, Select, TextInput, useCommand } from '../../components/admin/kit';
import { Avatar, AvatarPicker } from '../../components/admin/Avatar';
import { PhoneInput } from '../../components/admin/PhoneInput';
import { BranchChecklist } from '../../components/admin/BranchChecklist';
import { FOOT_PRIMARY, SHEET_FOOT, Sheet } from '../../components/admin/Sheet';
import { SheetHeader } from '../../components/admin/delivery';
import { Plus } from '../../components/icons';
import { DISPLAY, cx } from '../../components/ui';

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: 'STAFF', label: ROLE_LABEL.STAFF },
  { value: 'MANAGER', label: ROLE_LABEL.MANAGER },
  { value: 'OWNER', label: ROLE_LABEL.OWNER },
];

/** Most access first: the page reads as who runs the place, then who works it. */
const GROUP_ORDER: StaffRole[] = ['OWNER', 'MANAGER', 'STAFF'];
const GROUP_TITLE: Record<StaffRole, string> = { OWNER: 'Owners', MANAGER: 'Managers', STAFF: 'Staff' };

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

  const [adding, setAdding] = useState(false);

  // Offered only where there is a real choice: the live backend, and more than one branch to choose from.
  const branches = useAsync(() => (BRANCHES_ENABLED ? listBranches() : Promise.resolve([])), [staff]);
  const branchList = branches.data ?? [];
  const pickBranches = BRANCHES_ENABLED && branchList.length > 1;
  const branchName = (id: string) => branchList.find((branch) => branch.id === id)?.name ?? 'Another branch';

  const members = roster.data ?? [];
  const groups = GROUP_ORDER.map((role) => ({ role, people: members.filter((m) => m.role === role) })).filter((g) => g.people.length > 0);

  return (
    <>
      <div className="animate-rise">
        <PageTitle
          title="Staff"
          subtitle={`${members.length === 1 ? 'One person has' : `${members.length || 'Nobody'} ${members.length ? 'people have' : 'has'}`} a login to this dashboard.`}
          action={
            canEdit && (
              <button type="button" data-tour="add-staff-button" className={cx(ADMIN_GHOST, 'h-10 gap-1.5 px-4')} onClick={() => setAdding(true)}>
                <Plus size={15} /> Add a person
              </button>
            )
          }
        />
      </div>

      <div className="max-w-5xl">
        {roster.loading && !roster.data ? (
          <Loading />
        ) : members.length === 0 ? (
          <Empty
            emoji="🧑‍🍳"
            title="Nobody on the roster yet"
            message="Add the first member of the team."
            action={canEdit ? <button type="button" className={ADMIN_GHOST} onClick={() => setAdding(true)}>Add a person</button> : undefined}
          />
        ) : (
          <div className="grid gap-14">
            {groups.map(({ role, people }, g) => (
              <section key={role} className="animate-rise" style={{ animationDelay: `${120 + g * 80}ms` }}>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h2 className={cx(DISPLAY, 'text-[26px]')}>{GROUP_TITLE[role]}</h2>
                  <span className="text-[13.5px] text-ink-3 tnum">{people.length}</span>
                </div>
                <p className="mt-1 max-w-[60ch] text-[14px] leading-relaxed text-ink-3">{ROLE_SCOPE[role]}</p>

                <ul className="mt-5 grid gap-x-12 sm:grid-cols-2">
                  {people.map((member) => {
                    const mine = member.id === staff.id;
                    return (
                      <li key={member.id} className="flex items-start gap-4 border-t border-hairline py-5">
                        <Avatar name={member.name} src={member.avatarUrl} className="size-14 text-[21px]" />
                        <div className="min-w-0 flex-1">
                          <p className={cx(DISPLAY, 'truncate text-[21px]')}>
                            {member.name}
                            {mine && <span className="ml-2 font-sans text-[13px] font-normal text-flame-2">You</span>}
                          </p>
                          <p className="mt-0.5 truncate text-[13.5px] text-ink-3">{member.email}</p>
                          {member.phone && <p className="mt-0.5 text-[13.5px] text-ink-3 tnum">{member.phone}</p>}
                          {pickBranches && (
                            <p className="mt-0.5 text-[12.5px] text-ink-4">
                              {member.role === 'OWNER' ? 'All branches' : (member.branchIds ?? []).map(branchName).join(' · ') || 'No branch'}
                            </p>
                          )}
                          <Link
                            to={mine ? '/admin/profile' : `/admin/staff/${member.id}`}
                            className="mt-3 inline-block text-[13px] font-semibold text-ink-2 underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-flame"
                          >
                            {mine ? 'Your profile' : canEdit ? 'Manage' : 'View'}
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {adding && (
        <AddStaffSheet
          branchList={branchList}
          pickBranches={pickBranches}
          onClose={() => setAdding(false)}
          onAdded={roster.reload}
        />
      )}
    </>
  );
}

function AddStaffSheet({ branchList, pickBranches, onClose, onAdded }: { branchList: BranchRef[]; pickBranches: boolean; onClose: () => void; onAdded: () => void }) {
  const staff = useStaff();
  const { pending, busy, run } = useCommand();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<StaffRole>('STAFF');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [branchIds, setBranchIds] = useState<string[] | null>(null);
  // Until the owner picks, a new person starts in the branch being worked in right now.
  const chosenBranches = branchIds ?? (staff.branchId ? [staff.branchId] : []);
  const canSubmit = name.trim().length >= 2 && email.trim().length > 0 && !phoneError(phone) && (!IS_LIVE_API || /^\d{4,8}$/.test(pin));

  return (
    <Sheet label="Add a person" onClose={onClose}>
      {(close) => (
        <>
          <SheetHeader title="Add a person" intro="They sign in with their own email and PIN." onClose={() => close()} />
          <form
            data-tour="add-staff"
            className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto px-5 pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!canSubmit) return;
              void run(
                'new',
                () => createStaffMember(staff, { name, email, pin, role, phone: phone || undefined, avatarUrl: avatarUrl ?? undefined, branchIds: role === 'OWNER' || !pickBranches ? undefined : chosenBranches }),
                `${name.trim()} added to the team`,
              ).then((ok) => {
                if (!ok) return;
                onAdded();
                close();
              });
            }}
          >
            <AvatarPicker name={name || 'New person'} value={avatarUrl} onChange={setAvatarUrl} />
            <Field label="Name">
              <TextInput value={name} onChange={setName} maxLength={120} placeholder="Anita Gurung" autoFocus />
            </Field>
            <Field label="Phone" hint="Optional. Ten digits." error={phoneError(phone)}>
              <PhoneInput value={phone} onChange={setPhone} />
            </Field>
            <Field label="Work email" hint="If they already work at another restaurant on the platform, this links to that account.">
              <TextInput value={email} onChange={setEmail} type="email" maxLength={180} placeholder="anita@sekuwaghar.np" />
            </Field>
            {IS_LIVE_API && (
              <Field label="PIN" hint="4 to 8 digits — what they'll sign in with.">
                <TextInput value={pin} onChange={(next) => setPin(next.replace(/\D/g, ''))} type="password" inputMode="numeric" maxLength={8} placeholder="••••" className="tnum" />
              </Field>
            )}
            <div data-tour="staff-role">
              <Field label="Role" hint={ROLE_SCOPE[role]}>
                <Select value={role} onChange={setRole} options={ROLE_OPTIONS} />
              </Field>
            </div>
            {pickBranches && role !== 'OWNER' && (
              <Field label="Branches" hint="Where they work. They only see and handle these branches.">
                <BranchChecklist branches={branchList} value={chosenBranches} onChange={setBranchIds} />
              </Field>
            )}
            <div className={SHEET_FOOT}>
              <button type="submit" disabled={busy || !canSubmit} className={FOOT_PRIMARY}>
                {pending === 'new' ? 'Adding…' : 'Add to the team'}
              </button>
              <button type="button" className={cx(ADMIN_GHOST, 'h-11')} onClick={() => close()}>
                Cancel
              </button>
            </div>
          </form>
        </>
      )}
    </Sheet>
  );
}
