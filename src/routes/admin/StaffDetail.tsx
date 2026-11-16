import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { BRANCHES_ENABLED, listBranches, listStaff, removeStaffMember, updateStaffDetails } from '../../api/staff';
import { ROLE_LABEL, ROLE_SCOPE } from '../../domain/permissions';
import { phoneError } from '../../domain/phone';
import type { BranchRef, StaffMember, StaffRole } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { ADMIN_DANGER, ADMIN_GHOST, ADMIN_PRIMARY, Field, Loading, TextInput, useCommand } from '../../components/admin/kit';
import { Avatar, AvatarPicker } from '../../components/admin/Avatar';
import { BranchChecklist } from '../../components/admin/BranchChecklist';
import { PhoneInput } from '../../components/admin/PhoneInput';
import { FOOT_PRIMARY, SHEET_FOOT, Sheet } from '../../components/admin/Sheet';
import { SheetHeader } from '../../components/admin/delivery';
import { reduced } from '../../components/admin/profile';
import { Check, ChevronLeft } from '../../components/icons';
import { DISPLAY, cx } from '../../components/ui';

const ROLES: StaffRole[] = ['OWNER', 'MANAGER', 'STAFF'];

/**
 * One person on the team: who they are, what they may do, where they work, and taking them off.
 * Laid out like the branch and dish pages: name in the masthead, a rail down the sections, one floating
 * save bar. Your own record lives on Profile — the server does not let you change your own role or access.
 */
export function StaffDetail() {
  const { memberId = '' } = useParams();
  const staff = useStaff();
  const { allows } = useAuth();
  const roster = useAsync(() => listStaff(staff), [staff]);
  const branches = useAsync(() => (BRANCHES_ENABLED ? listBranches() : Promise.resolve([])), [staff]);

  if (memberId === staff.id) return <Navigate to="/admin/profile" replace />;
  if (!roster.data) {
    return roster.error ? (
      <p className="rounded-2xl bg-berry/10 px-4 py-3 text-[14px] text-berry ring-1 ring-berry/25 ring-inset">{roster.error.message}</p>
    ) : (
      <Loading />
    );
  }
  const member = roster.data.find((m) => m.id === memberId);
  if (!member)
    return (
      <p className="py-16 text-center text-[14px] text-ink-3">
        That person is no longer on the team.{' '}
        <Link to="/admin/staff" className="font-semibold text-flame-1">
          Back to staff
        </Link>
      </p>
    );

  return <StaffEditor member={member} canEdit={allows('settings:edit')} branchList={branches.data ?? []} onSaved={roster.reload} />;
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

function StaffEditor({ member, canEdit, branchList, onSaved }: { member: StaffMember; canEdit: boolean; branchList: BranchRef[]; onSaved: () => void }) {
  const staff = useStaff();
  const navigate = useNavigate();
  const { busy, run } = useCommand();
  const pickBranches = BRANCHES_ENABLED && branchList.length > 1;

  const [name, setName] = useState(member.name);
  const [phone, setPhone] = useState(member.phone ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(member.avatarUrl ?? null);
  const [role, setRole] = useState<StaffRole>(member.role);
  const [ids, setIds] = useState<string[]>(member.branchIds ?? []);
  const [justSaved, setJustSaved] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [active, setActive] = useState('details');
  const saveRef = useRef<() => void>(() => {});

  const showBranches = pickBranches && role !== 'OWNER';
  const nameOk = name.trim().length >= 2;
  const phoneProblem = phoneError(phone);
  const was = member.branchIds ?? [];
  const sameIds = ids.length === was.length && ids.every((id) => was.includes(id));
  // Somebody who was an owner has no branch rows, so demoting them must say where they work.
  const needsBranches = member.role === 'OWNER' && role !== 'OWNER';

  const patch = {
    ...(name.trim() !== member.name && { name: name.trim() }),
    ...(phone !== (member.phone ?? '') && { phone: phone || null }),
    ...(avatarUrl !== (member.avatarUrl ?? null) && { avatarUrl }),
    ...(role !== member.role && { role }),
    ...(showBranches && (!sameIds || needsBranches) && { branchIds: ids }),
  };
  const dirty = Object.keys(patch).length > 0;
  const canSave = canEdit && dirty && nameOk && !phoneProblem && (!showBranches || ids.length > 0) && !busy;

  const changeRole = (next: StaffRole) => {
    setRole(next);
    // Demoted from owner with nothing chosen: start in the branch being worked in now.
    if (next !== 'OWNER' && ids.length === 0 && staff.branchId) setIds([staff.branchId]);
  };

  const reset = () => {
    setName(member.name);
    setPhone(member.phone ?? '');
    setAvatarUrl(member.avatarUrl ?? null);
    setRole(member.role);
    setIds(member.branchIds ?? []);
  };

  const save = () => {
    if (!canSave) return;
    void run('save', () => updateStaffDetails(member.id, patch)).then((ok) => {
      if (!ok) return;
      onSaved();
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1800);
    });
  };
  saveRef.current = save;

  // The rail marks whichever section is crossing the upper third of the screen.
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>('[data-section]')];
    if (els.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: '-25% 0px -65% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

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

  const sections = [
    { id: 'details', label: 'Details' },
    { id: 'role', label: 'Role' },
    ...(pickBranches ? [{ id: 'branches', label: 'Branches' }] : []),
    ...(canEdit ? [{ id: 'access', label: 'Access' }] : []),
  ];
  const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  const branchName = (id: string) => branchList.find((b) => b.id === id)?.name ?? 'Another branch';

  return (
    <div className="w-full pb-28">
      <Link to="/admin/staff" className="mb-6 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 transition-colors hover:text-ink">
        <ChevronLeft size={15} /> Staff
      </Link>

      {/* ── Masthead: the person, name editable in place ── */}
      <header className="mb-10 flex animate-rise items-center gap-5 sm:gap-7">
        <Avatar name={name || member.name} src={avatarUrl} className="size-20 text-4xl sm:size-28 sm:text-5xl" />
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="staff-name">
            Name
          </label>
          <input
            id="staff-name"
            value={name}
            maxLength={120}
            disabled={!canEdit}
            placeholder="Name"
            onChange={(e) => setName(e.target.value)}
            className={cx(
              DISPLAY,
              'w-full border-b border-transparent bg-transparent pb-1 text-[clamp(28px,5vw,46px)] tracking-[-0.02em] outline-none transition-colors duration-200 placeholder:text-ink-4 enabled:hover:border-hairline-strong enabled:focus:border-flame-2',
            )}
          />
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-ink-3">
            <span className="font-semibold text-ink-2">{ROLE_LABEL[member.role]}</span>
            <span className="truncate">{member.email}</span>
            {pickBranches && <span>{member.role === 'OWNER' ? 'All branches' : was.map(branchName).join(' · ') || 'No branch'}</span>}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-14 lg:grid-cols-[9.5rem_minmax(0,1fr)]">
        <nav aria-label="Sections" className="min-w-0 -mx-4 mb-6 px-4 sm:-mx-6 sm:px-6 lg:sticky lg:top-24 lg:z-20 lg:mx-0 lg:mb-0 lg:self-start lg:p-0">
          <ul className="no-scrollbar flex gap-1 overflow-x-auto py-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:py-0">
            {sections.map((x) => (
              <li key={x.id} className="shrink-0">
                <button
                  type="button"
                  aria-current={active === x.id ? 'true' : undefined}
                  onClick={() => goTo(x.id)}
                  className={cx(
                    'relative flex h-9 w-full items-center whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-semibold transition-colors duration-200 lg:rounded-xl lg:pl-4',
                    active === x.id ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:text-ink',
                  )}
                >
                  <span
                    aria-hidden
                    className={cx(
                      'absolute left-0 hidden h-4 w-0.5 rounded-full bg-flame transition-[opacity,scale] duration-300 ease-spring lg:block',
                      active === x.id ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0',
                    )}
                  />
                  {x.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          <fieldset disabled={!canEdit} className="contents">
            <Section id="details" title="Details" hint={canEdit ? undefined : 'Only an owner can change these.'}>
              <div className="grid gap-6">
                <AvatarPicker name={name || member.name} value={avatarUrl} onChange={setAvatarUrl} disabled={!canEdit} />
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field label="Phone" hint="Optional. Ten digits." error={phoneProblem}>
                    <PhoneInput value={phone} onChange={setPhone} />
                  </Field>
                  <Field label="Email" hint="They sign in with this, so it can't be changed here.">
                    <TextInput value={member.email} onChange={() => {}} disabled />
                  </Field>
                </div>
              </div>
            </Section>

            <Section id="role" title="Role" hint="What they can see and change. A new role reaches them the next time they sign in.">
              <div role="radiogroup" aria-label="Role" className="grid max-w-xl">
                {ROLES.map((r) => {
                  const on = r === role;
                  return (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => changeRole(r)}
                      className="flex items-start gap-4 border-t border-dashed border-hairline py-4 text-left first:border-t-0 first:pt-0 disabled:opacity-60"
                    >
                      <span
                        aria-hidden
                        className={cx(
                          'mt-1 grid size-5 shrink-0 place-items-center rounded-full ring-1 ring-inset transition-colors duration-200',
                          on ? 'bg-flame text-white ring-flame' : 'ring-hairline-strong',
                        )}
                      >
                        {on && <Check size={12} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[16px] font-semibold">{ROLE_LABEL[r]}</span>
                        <span className="mt-0.5 block text-[13.5px] leading-snug text-ink-3">{ROLE_SCOPE[r]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>

            {pickBranches && (
              <Section id="branches" title="Branches" hint="Where they work. They only see and handle these branches.">
                {role === 'OWNER' ? (
                  <p className="text-[14.5px] text-ink-3">Owners reach every branch, so there is nothing to choose.</p>
                ) : (
                  <BranchChecklist branches={branchList} value={ids} onChange={setIds} disabled={!canEdit} />
                )}
              </Section>
            )}
          </fieldset>

          {canEdit && (
            <Section id="access" title="Access" hint="Take them off the team.">
              <div className="flex flex-wrap items-center gap-4">
                <button type="button" className={ADMIN_DANGER} onClick={() => setRemoving(true)}>
                  Remove from the team
                </button>
                <p className="max-w-[44ch] text-[13.5px] leading-snug text-ink-3">They can no longer sign in here. Their order history stays.</p>
              </div>
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
          <div className="flex w-full max-w-lg items-center gap-3 rounded-full bg-surface-2/90 py-2 pr-2 pl-5 shadow-deep ring-1 ring-hairline-strong ring-inset backdrop-blur-xl">
            <span className="flex min-w-0 flex-1 items-center gap-2.5 truncate text-[13.5px] text-ink-2">
              <span aria-hidden className={cx('size-2 shrink-0 rounded-full', justSaved ? 'bg-mint' : 'animate-breathe bg-gold')} />
              {justSaved ? 'Saved' : 'Unsaved changes'}
            </span>
            <button type="button" className={cx(ADMIN_GHOST, 'h-9 px-3.5')} disabled={busy || !dirty} onClick={reset}>
              Discard
            </button>
            <button type="button" className={cx(ADMIN_PRIMARY, 'relative h-9 overflow-hidden px-4')} disabled={!canSave && !justSaved} onClick={save}>
              <span aria-hidden className={cx('absolute inset-0 origin-left bg-mint transition-transform duration-500 ease-out-quart', justSaved ? 'scale-x-100' : 'scale-x-0')} />
              <span className="relative inline-flex items-center gap-1.5">
                {justSaved ? (
                  <>
                    <Check size={15} /> Saved
                  </>
                ) : busy ? (
                  'Saving…'
                ) : (
                  'Save'
                )}
              </span>
            </button>
          </div>
        </div>
      )}

      {removing && (
        <RemoveSheet
          member={member}
          onClose={() => setRemoving(false)}
          onRemoved={() => {
            onSaved();
            navigate('/admin/staff');
          }}
        />
      )}
    </div>
  );
}

function RemoveSheet({ member, onClose, onRemoved }: { member: StaffMember; onClose: () => void; onRemoved: () => void }) {
  const { pending, busy, run } = useCommand();
  return (
    <Sheet label={`Remove ${member.name}`} onClose={onClose}>
      {(close) => (
        <>
          <SheetHeader title={`Remove ${member.name}?`} intro="They come off the team and can no longer sign in to this restaurant." onClose={() => close()} />
          <div className="grid flex-1 content-start gap-4 overflow-y-auto px-5 pt-5 text-[14px] leading-relaxed text-ink-3">
            <p>Their order history and the audit log stay as they are.</p>
            <p>A session they already have open is not cut off the moment you press this: it keeps working until it expires, which can take days.</p>
            <div className={SHEET_FOOT}>
              <button
                type="button"
                disabled={busy}
                className={cx(FOOT_PRIMARY, '!bg-berry !text-white')}
                onClick={() =>
                  void run('remove', () => removeStaffMember(member.id), `${member.name} removed from the team`).then((ok) => {
                    if (!ok) return;
                    close();
                    onRemoved();
                  })
                }
              >
                {pending === 'remove' ? 'Removing…' : 'Remove from the team'}
              </button>
              <button type="button" className={cx(ADMIN_GHOST, 'h-11')} onClick={() => close()}>
                Keep them
              </button>
            </div>
          </div>
        </>
      )}
    </Sheet>
  );
}
