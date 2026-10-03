import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createBranch, listBranches } from '../../api/staff';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { ADMIN_PRIMARY, Empty, Field, Loading, PageTitle, Panel, Select, TextInput, useCommand } from '../../components/admin/kit';
import { MapPin } from '../../components/icons';
import { cx } from '../../components/ui';

/**
 * A restaurant's locations. Everyone with Settings access can see the ones they work at; only an
 * owner adds one. Each branch has its own tables, orders, hours, fees and menu overrides — the brand,
 * the base menu and the team are shared.
 */
export function Branches() {
  const staff = useStaff();
  const { allows, refreshBranches } = useAuth();
  const navigate = useNavigate();
  const { pending, busy, run } = useCommand();
  const branches = useAsync(() => listBranches(), [staff]);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  /** Where the new branch's menu starts from. Empty string = a blank menu. */
  const [copyFrom, setCopyFrom] = useState('');
  const canEdit = allows('settings:edit');

  const submit = () =>
    void run(
      'new',
      async () => {
        const created = await createBranch({
          name,
          address,
          phone,
          timezone: 'Asia/Kathmandu',
          serviceChargeRate: null,
          taxRate: null,
          deliveryFeeAmount: null,
          copyMenuFrom: copyFrom || undefined,
        });
        // The new branch must reach the switcher before we leave, or it would not appear until the next sign-in.
        await refreshBranches();
        navigate(`/admin/branches/${created.id}`);
      },
      `${name.trim()} added`,
    );

  return (
    <>
      <PageTitle title="Branches" subtitle="Each location has its own tables, orders, hours and prices." />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <Panel title="Locations" bare>
          {branches.loading && !branches.data ? (
            <Loading />
          ) : (branches.data ?? []).length === 0 ? (
            <Empty emoji="📍" title="No branches yet" message="Add your first location." />
          ) : (
            <ul>
              {(branches.data ?? []).map((branch) => (
                <li key={branch.id} className="border-b border-hairline last:border-0">
                  <Link to={`/admin/branches/${branch.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/40 sm:px-5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3">
                      <MapPin size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold">
                        {branch.name}
                        {branch.id === staff.branchId && <span className="ml-1.5 font-normal text-ink-4">(working here)</span>}
                      </span>
                      <span className="block truncate text-[12.5px] text-ink-4">{branch.address || 'No address yet'}</span>
                    </span>
                    {branch.isDefault && <Chip>Main</Chip>}
                    {!branch.isActive && <Chip tone="warn">Disabled</Chip>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {canEdit ? (
          <Panel title="Add a branch" hint="Fees and hours can be set on the next screen. Staff are assigned on the Staff page.">
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <Field label="Name">
                <TextInput value={name} onChange={setName} maxLength={60} placeholder="Lazimpat" />
              </Field>
              <Field label="Address">
                <TextInput value={address} onChange={setAddress} maxLength={200} placeholder="Lazimpat Road, Kathmandu" />
              </Field>
              <Field label="Phone" hint="Optional.">
                <TextInput value={phone} onChange={setPhone} maxLength={30} placeholder="01-4000000" />
              </Field>
              {(branches.data ?? []).length > 0 && (
                <Field label="Menu" hint="Every branch has its own menu. A copy is a starting point — after that the two are independent.">
                  <Select
                    value={copyFrom}
                    onChange={setCopyFrom}
                    options={[{ value: '', label: 'Start with an empty menu' }, ...(branches.data ?? []).map((b) => ({ value: b.id, label: `Copy from ${b.name}` }))]}
                  />
                </Field>
              )}
              <button type="submit" className={ADMIN_PRIMARY} disabled={busy || name.trim().length < 2}>
                {pending === 'new' ? 'Adding…' : 'Add branch'}
              </button>
            </form>
          </Panel>
        ) : (
          <Panel title="Add a branch" hint="Only an owner can add branches">
            <p className="text-[12.5px] leading-relaxed text-ink-4">Ask an owner to add a new location.</p>
          </Panel>
        )}
      </div>
    </>
  );
}

function Chip({ children, tone = 'plain' }: { children: string; tone?: 'plain' | 'warn' }) {
  return (
    <span
      className={cx(
        'shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ring-inset',
        tone === 'warn' ? 'bg-berry/10 text-berry ring-berry/25' : 'bg-surface-2 text-ink-3 ring-hairline',
      )}
    >
      {children}
    </span>
  );
}
