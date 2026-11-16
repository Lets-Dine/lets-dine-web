import { useEffect, useState } from 'react';
import { changeOwnPin, fetchOwnProfile, setApprovalPin, updateOwnProfile } from '../../api/staff';
import { ROLE_LABEL, can } from '../../domain/permissions';
import { cleanPhone, phoneError } from '../../domain/phone';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAdminTheme } from '../../state/AdminTheme';
import { useAsync } from '../../state/useAsync';
import { ADMIN_PRIMARY, DOCKET_CARD, Field, Loading, PageTitle, Perforation, TextInput, useCommand } from '../../components/admin/kit';
import { Avatar, AvatarPicker } from '../../components/admin/Avatar';
import { Check, Eye, MapPin, Moon, Sun } from '../../components/icons';
import { DISPLAY, cx } from '../../components/ui';

const PIN_RE = /^\d{4,8}$/;
const digits = (v: string) => v.replace(/\D/g, '');

/**
 * The signed-in person's own account. The left slip is who they are on this shift (a docket, like the
 * ledgers); the right slip is what they can change: name and phone, and the sign-in PIN. Email, role and
 * branch are shown but belong to the owner.
 */
export function Profile() {
  const staff = useStaff();
  const profile = useAsync(fetchOwnProfile, [staff.id]);
  const { applyProfile } = useAuth();
  const [fresh, setFresh] = useState<{ phone: string; avatarUrl: string | null } | null>(null);
  const phone = fresh ? fresh.phone : profile.data?.phone ?? '';
  const avatarUrl = fresh ? fresh.avatarUrl : profile.data?.avatarUrl ?? null;

  // A photo an owner set for you reaches the sidebar the first time you open your profile.
  useEffect(() => {
    if (profile.data && (profile.data.avatarUrl ?? null) !== (staff.avatarUrl ?? null)) applyProfile({ avatarUrl: profile.data.avatarUrl });
  }, [profile.data, staff.avatarUrl, applyProfile]);

  return (
    <div className="max-w-5xl selection:bg-flame/30 [caret-color:var(--color-flame-2)]">
      <PageTitle title="Profile" />
      <div className="grid items-start gap-6 lg:grid-cols-[300px_1fr] lg:gap-8">
        <IdentityPass phone={phone} avatarUrl={avatarUrl} email={profile.data?.email ?? staff.email} />

        <section className={cx(DOCKET_CARD, 'pb-2')}>
          {profile.loading ? (
            <Loading label="Loading your details…" />
          ) : profile.data ? (
            <>
              <DetailsForm
                name={profile.data.name}
                email={profile.data.email}
                phone={profile.data.phone ?? ''}
                avatarUrl={profile.data.avatarUrl ?? null}
                onSaved={(next) => setFresh({ phone: next.phone ?? '', avatarUrl: next.avatarUrl })}
              />
              <Perforation />
              <PinForm />
              {/* Only somebody who can approve a discount has anything to set. */}
              {can(staff.role, 'payments:discount') && (
                <>
                  <Perforation />
                  <ApprovalPinForm isSet={profile.data.hasApprovalPin} />
                </>
              )}
            </>
          ) : (
            <p className="px-6 py-8 text-[14px] text-docket-inksoft">Editing your details needs the live backend.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function IdentityPass({ phone, avatarUrl, email }: { phone: string; avatarUrl: string | null; email: string }) {
  const staff = useStaff();
  const { signOut } = useAuth();
  const { theme, toggle } = useAdminTheme();
  const branch = staff.branches?.find((b) => b.id === staff.branchId);

  const rows: [string, string][] = [
    ['Email', email],
    ['Phone', phone || 'Not added'],
  ];

  return (
    <aside className={cx(DOCKET_CARD, 'animate-deal lg:sticky lg:top-8')}>
      <div className="px-6 pt-6">
        <Avatar name={staff.name} src={avatarUrl} className="size-24 text-[36px]" />
        <h2 className={cx(DISPLAY, 'mt-4 text-[26px] text-balance break-words')}>{staff.name}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-flame/12 px-2.5 py-1 text-[12px] font-semibold text-flame-2">{ROLE_LABEL[staff.role]}</span>
          {branch && (
            <span className="inline-flex items-center gap-1 text-[12.5px] text-docket-inksoft">
              <MapPin size={13} />
              {branch.name}
            </span>
          )}
        </div>
      </div>

      <div className="mt-5">
        <Perforation />
      </div>

      <dl className="grid gap-3.5 px-6 py-5">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[12px] text-docket-inksoft">{k}</dt>
            <dd className="mt-0.5 text-[14px] font-semibold break-all">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-2 divide-x divide-docket-line border-t border-docket-line text-[13.5px] font-semibold">
        <button type="button" onClick={toggle} className="flex items-center justify-center gap-2 py-3.5 text-docket-inksoft transition-colors hover:bg-surface-2 hover:text-docket-ink">
          {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
        <button type="button" onClick={signOut} className="py-3.5 text-docket-inksoft transition-colors hover:bg-surface-2 hover:text-docket-berry">
          Log out
        </button>
      </div>
    </aside>
  );
}

function SectionHead({ title, children, action }: { title: string; children: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className={cx(DISPLAY, 'text-[21px]')}>{title}</h2>
        <p className="mt-1 max-w-[52ch] text-[13.5px] leading-relaxed text-docket-inksoft">{children}</p>
      </div>
      {action}
    </div>
  );
}

function DetailsForm({
  name: savedName,
  email,
  phone: savedPhone,
  avatarUrl: savedAvatar,
  onSaved,
}: {
  name: string;
  email: string;
  phone: string;
  avatarUrl: string | null;
  onSaved: (next: { name: string; phone: string | null; avatarUrl: string | null }) => void;
}) {
  const { applyProfile } = useAuth();
  const { busy, run } = useCommand();
  const [name, setName] = useState(savedName);
  const [phone, setPhone] = useState(savedPhone);
  const [avatar, setAvatar] = useState(savedAvatar);
  const [saved, setSaved] = useState({ name: savedName, phone: savedPhone, avatarUrl: savedAvatar });

  const nameOk = name.trim().length >= 2;
  const phoneProblem = phoneError(phone);
  const dirty = name.trim() !== saved.name || phone !== saved.phone || avatar !== saved.avatarUrl;

  function save() {
    const patch = {
      ...(name.trim() !== saved.name && { name: name.trim() }),
      ...(phone !== saved.phone && { phone: phone || null }),
      ...(avatar !== saved.avatarUrl && { avatarUrl: avatar }),
    };
    void run(
      'details',
      async () => {
        const next = await updateOwnProfile(patch);
        applyProfile({ name: next.name, avatarUrl: next.avatarUrl });
        onSaved(next);
        setSaved({ name: next.name, phone: next.phone ?? '', avatarUrl: next.avatarUrl });
        setName(next.name);
        setPhone(next.phone ?? '');
        setAvatar(next.avatarUrl);
      },
      'Profile updated',
    );
  }

  return (
    <form
      className="grid gap-5 px-6 pt-6 pb-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (nameOk && !phoneProblem && dirty) save();
      }}
    >
      <SectionHead title="Your details">How you appear to the team on orders and in the audit log.</SectionHead>
      <AvatarPicker name={name} value={avatar} onChange={setAvatar} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={nameOk ? undefined : 'At least 2 characters'}>
          <TextInput value={name} onChange={setName} maxLength={120} autoComplete="name" />
        </Field>
        <Field label="Phone" hint="Optional. Ten digits. One account per number." error={phoneProblem}>
          <TextInput value={phone} onChange={(v) => setPhone(cleanPhone(v))} type="tel" inputMode="numeric" maxLength={10} placeholder="98XXXXXXXX" autoComplete="tel" className="tnum" />
        </Field>
        <Field label="Email" hint="You sign in with this, so only an owner can change it." className="sm:col-span-2">
          <TextInput value={email} onChange={() => {}} disabled />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-4">
        <p aria-live="polite" className="flex items-center gap-2 text-[12.5px] text-docket-inksoft">
          {dirty ? (
            <>
              <span className="size-1.5 rounded-full bg-flame" />
              Unsaved changes
            </>
          ) : (
            <>
              <Check size={13} className="text-docket-mint" />
              Up to date
            </>
          )}
        </p>
        <button type="submit" disabled={busy || !nameOk || !!phoneProblem || !dirty} className={ADMIN_PRIMARY}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

function PinForm() {
  const { busy, run } = useCommand();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [shown, setShown] = useState(false);

  const checks: [string, boolean][] = [
    ['4 to 8 digits', PIN_RE.test(next)],
    ['Different from your current PIN', next !== '' && next !== current],
    ['Matches the confirmation', next !== '' && again === next],
  ];
  const ready = PIN_RE.test(current) && checks.every(([, ok]) => ok);
  const type = shown ? 'text' : 'password';

  return (
    <form
      className="grid gap-5 px-6 pt-5 pb-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        void run('pin', () => changeOwnPin(current, next), 'PIN changed').then((ok) => {
          if (ok) {
            setCurrent('');
            setNext('');
            setAgain('');
          }
        });
      }}
    >
      <SectionHead
        title="Sign-in PIN"
        action={
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-pressed={shown}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-docket-inksoft ring-1 ring-docket-line ring-inset transition-colors hover:text-docket-ink aria-pressed:bg-surface-2 aria-pressed:text-docket-ink"
          >
            <Eye size={14} />
            {shown ? 'Hide' : 'Show'}
          </button>
        }
      >
        The PIN you use with your email to sign in on every device.
      </SectionHead>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Current">
          <TextInput value={current} onChange={(v) => setCurrent(digits(v))} type={type} inputMode="numeric" maxLength={8} autoComplete="current-password" />
        </Field>
        <Field label="New">
          <TextInput value={next} onChange={(v) => setNext(digits(v))} type={type} inputMode="numeric" maxLength={8} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new">
          <TextInput value={again} onChange={(v) => setAgain(digits(v))} type={type} inputMode="numeric" maxLength={8} autoComplete="new-password" />
        </Field>
      </div>
      <ul className="grid gap-1.5 text-[12.5px]">
        {checks.map(([label, ok]) => (
          <li key={label} className={cx('flex items-center gap-2 transition-colors', ok ? 'text-docket-ink' : 'text-docket-inksoft')}>
            <span className={cx('grid size-4 place-items-center rounded-full ring-1 ring-inset transition-colors', ok ? 'bg-docket-mint/20 text-docket-mint ring-docket-mint/40' : 'ring-docket-line')}>
              {ok && <Check size={10} />}
            </span>
            {label}
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <button type="submit" disabled={busy || !ready} className={ADMIN_PRIMARY}>
          {busy ? 'Changing…' : 'Change PIN'}
        </button>
      </div>
    </form>
  );
}

/**
 * The PIN a cashier's discount or changed bill is approved with, typed at their till. A second PIN on purpose: if it is seen, it
 * opens nothing. Until one is set, this person is not offered when a cashier asks for a manager.
 */
function ApprovalPinForm({ isSet }: { isSet: boolean }) {
  const { busy, run } = useCommand();
  const [set, setSet] = useState(isSet);
  const [signIn, setSignIn] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [shown, setShown] = useState(false);

  const checks: [string, boolean][] = [
    ['4 to 8 digits', PIN_RE.test(next)],
    ['Different from your sign-in PIN', next !== '' && next !== signIn],
    ['Matches the confirmation', next !== '' && again === next],
  ];
  const ready = PIN_RE.test(signIn) && checks.every(([, ok]) => ok);
  const type = shown ? 'text' : 'password';

  return (
    <form
      className="grid gap-5 px-6 pt-5 pb-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        void run('approval-pin', () => setApprovalPin(signIn, next), 'Approval PIN saved').then((ok) => {
          if (!ok) return;
          setSet(true);
          setSignIn('');
          setNext('');
          setAgain('');
        });
      }}
    >
      <SectionHead
        title="Approval PIN"
        action={
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-pressed={shown}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-docket-inksoft ring-1 ring-docket-line ring-inset transition-colors hover:text-docket-ink aria-pressed:bg-surface-2 aria-pressed:text-docket-ink"
          >
            <Eye size={14} />
            {shown ? 'Hide' : 'Show'}
          </button>
        }
      >
        What you type at a cashier's till to approve a discount or a changed bill. It is separate from your sign-in PIN, so it can be seen without giving anything else away.
      </SectionHead>
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <span aria-hidden className={cx('size-2 rounded-full', set ? 'bg-docket-mint' : 'bg-gold')} />
        {set ? 'Set. You can approve at the till.' : "Not set yet. Cashiers can't ask you to approve anything."}
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Your sign-in PIN" hint="To confirm it's you.">
          <TextInput value={signIn} onChange={(v) => setSignIn(digits(v))} type={type} inputMode="numeric" maxLength={8} autoComplete="one-time-code" />
        </Field>
        <Field label={set ? 'New approval PIN' : 'Approval PIN'}>
          <TextInput value={next} onChange={(v) => setNext(digits(v))} type={type} inputMode="numeric" maxLength={8} autoComplete="one-time-code" />
        </Field>
        <Field label="Confirm">
          <TextInput value={again} onChange={(v) => setAgain(digits(v))} type={type} inputMode="numeric" maxLength={8} autoComplete="one-time-code" />
        </Field>
      </div>
      <ul className="grid gap-1.5 text-[12.5px]">
        {checks.map(([label, ok]) => (
          <li key={label} className={cx('flex items-center gap-2 transition-colors', ok ? 'text-docket-ink' : 'text-docket-inksoft')}>
            <span className={cx('grid size-4 place-items-center rounded-full ring-1 ring-inset transition-colors', ok ? 'bg-docket-mint/20 text-docket-mint ring-docket-mint/40' : 'ring-docket-line')}>
              {ok && <Check size={10} />}
            </span>
            {label}
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <button type="submit" disabled={busy || !ready} className={ADMIN_PRIMARY}>
          {busy ? 'Saving…' : set ? 'Change approval PIN' : 'Set approval PIN'}
        </button>
      </div>
    </form>
  );
}
