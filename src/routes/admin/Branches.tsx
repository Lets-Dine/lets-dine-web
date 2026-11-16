import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createBranch, listBranches } from '../../api/staff';
import { feeSummary } from '../../domain/branchFees';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { ADMIN_GHOST, ADMIN_PRIMARY, DOCKET_CARD, Empty, Field, Loading, PageTitle, Select, TextInput, useCommand } from '../../components/admin/kit';
import { ChevronRight, MapPin, Plus } from '../../components/icons';
import { FOOT_PRIMARY, SHEET_FOOT, Sheet } from '../../components/admin/Sheet';
import { SheetHeader } from '../../components/admin/delivery';
import { DISPLAY, cx } from '../../components/ui';

/**
 * A restaurant's locations. Everyone with Settings access can see the ones they work at; only an
 * owner adds one. Each branch has its own tables, orders, hours, fees and menu overrides — the brand,
 * the base menu and the team are shared.
 */
export function Branches() {
  const staff = useStaff();
  const { allows, switchBranch } = useAuth();
  const { pending, busy, run } = useCommand();
  const branches = useAsync(() => listBranches(), [staff]);

  const [adding, setAdding] = useState(false);
  const canEdit = allows('settings:edit');
  const list = branches.data ?? [];
  // The branch you are working in leads; if it is not in the list (or you have none), the first one does.
  const featured = list.find((b) => b.id === staff.branchId) ?? list[0];
  const others = list.filter((b) => b !== featured);

  return (
    <>
      <div className="animate-rise">
        <PageTitle
          title="Branches"
          subtitle={`${list.length === 1 ? 'One location' : `${list.length || 'No'} locations`}. Each has its own tables, orders, hours and prices.`}
          action={
            canEdit && (
              <button type="button" className={cx(ADMIN_GHOST, 'h-10 gap-1.5 px-4')} onClick={() => setAdding(true)}>
                <Plus size={15} /> Add a branch
              </button>
            )
          }
        />
      </div>

      <div className="animate-rise max-w-5xl [animation-delay:120ms]">
          {branches.loading && !branches.data ? (
            <Loading />
          ) : list.length === 0 ? (
            <Empty emoji="📍" title="No branches yet" message="Add your first location." action={canEdit ? <button type="button" className={ADMIN_PRIMARY} onClick={() => setAdding(true)}>Add a branch</button> : undefined} />
          ) : (
            <div className="grid gap-14">
              {featured && (
                <article className={cx(DOCKET_CARD, 'group animate-rise relative px-7 py-8 transition-shadow duration-300 hover:shadow-deep focus-within:shadow-deep sm:px-10 sm:py-10')} style={{ animationDelay: '160ms' }}>
                  <div className="grid gap-8 sm:grid-cols-[1fr_auto] sm:gap-14">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[13px] font-semibold text-docket-inksoft">
                        <span aria-hidden className={cx('size-2 rounded-full', featured.id === staff.branchId ? 'bg-flame' : 'bg-docket-inksoft')} />
                        {featured.id === staff.branchId ? 'Working here' : featured.isDefault ? 'Main branch' : 'Branch'}
                        {featured.isDefault && featured.id === staff.branchId && <span className="font-normal">· Main branch</span>}
                      </p>
                      <h2 className={cx(DISPLAY, 'mt-3 text-[clamp(34px,5vw,52px)] tracking-[-0.02em] text-balance break-words')}>
                        <Link to={`/admin/branches/${featured.id}`} className="outline-none after:absolute after:inset-0 after:content-['']">
                          {featured.name}
                        </Link>
                      </h2>
                      <p className="mt-3 flex items-start gap-2 text-[15px] text-docket-ink/80">
                        <MapPin size={16} className="mt-0.5 shrink-0 text-docket-inksoft" />
                        {featured.address || 'No address yet'}
                      </p>
                    </div>
                    <dl className="grid content-end gap-4 text-[14px] sm:min-w-52 sm:border-l sm:border-dashed sm:border-docket-line sm:pl-10">
                      {featured.phone && (
                        <div>
                          <dt className="text-[12px] text-docket-inksoft">Phone</dt>
                          <dd className="mt-0.5 font-semibold">{featured.phone}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-[12px] text-docket-inksoft">Charges</dt>
                        <dd className="mt-0.5 font-semibold">{feeSummary(featured)}</dd>
                      </div>
                      <div>
                        <dt className="text-[12px] text-docket-inksoft">Status</dt>
                        <dd className="mt-0.5 font-semibold">{featured.isActive ? 'Taking orders' : 'Closed to orders'}</dd>
                      </div>
                    </dl>
                  </div>
                  <p className="mt-8 inline-flex items-center gap-1.5 text-[14px] font-semibold text-docket-inksoft transition-colors group-hover:text-docket-ink">
                    Manage branch <ChevronRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" />
                  </p>
                </article>
              )}

              {others.length > 0 && (
                <section>
                  <h2 className={cx(DISPLAY, 'text-[22px]')}>Other locations</h2>
                  <ul className="mt-4 grid gap-x-12 sm:grid-cols-2">
                    {others.map((branch, i) => {
                      const reachable = (staff.branches ?? []).some((b) => b.id === branch.id);
                      return (
                        <li key={branch.id} className="group animate-rise relative border-t border-hairline py-7" style={{ animationDelay: `${260 + Math.min(i, 8) * 50}ms` }}>
                          <div className="flex items-start justify-between gap-4">
                            <h3 className={cx(DISPLAY, 'text-[26px] break-words')}>
                              <Link
                                to={`/admin/branches/${branch.id}`}
                                className="underline decoration-transparent decoration-1 underline-offset-[6px] transition-[text-decoration-color] duration-200 outline-none group-hover:decoration-flame focus-visible:decoration-flame after:absolute after:inset-0 after:content-['']"
                              >
                                {branch.name}
                              </Link>
                            </h3>
                            <ChevronRight size={18} className="mt-2 shrink-0 text-ink-4 transition-[translate,color] duration-200 group-hover:translate-x-1 group-hover:text-ink" />
                          </div>
                          <p className="mt-2 text-[14px] text-ink-3">{branch.address || 'No address yet'}</p>
                          <p className="mt-0.5 text-[13px] text-ink-4">
                            {[branch.phone, feeSummary(branch)].filter(Boolean).join(' · ')}
                          </p>
                          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                            <span className="inline-flex items-center gap-2 text-ink-3">
                              <span aria-hidden className={cx('size-2 rounded-full', branch.isActive ? 'bg-mint' : 'bg-ink-4')} />
                              {branch.isActive ? 'Taking orders' : 'Disabled'}
                            </span>
                            {branch.isDefault && <span className="text-ink-4">Main branch</span>}
                            {reachable && branch.isActive && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void run(`switch-${branch.id}`, () => switchBranch(branch.id), `Now working at ${branch.name}`)}
                                className="relative z-10 ml-auto font-semibold text-ink-2 underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-flame disabled:opacity-50"
                              >
                                {pending === `switch-${branch.id}` ? 'Switching…' : 'Switch here'}
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
          )}
      </div>

      {adding && <AddBranchSheet branches={list} onClose={() => setAdding(false)} />}
    </>
  );
}

/** The add form lives behind a button: the page is about the branches that exist, adding one is the occasional act. */
function AddBranchSheet({ branches, onClose }: { branches: { id: string; name: string }[]; onClose: () => void }) {
  const navigate = useNavigate();
  const { refreshBranches } = useAuth();
  const { pending, busy, run } = useCommand();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  /** Where the new branch's menu starts from. Empty string = a blank menu. */
  const [copyFrom, setCopyFrom] = useState('');
  const ready = name.trim().length >= 2;

  return (
    <Sheet label="Add a branch" onClose={onClose}>
      {(close) => (
        <>
          <SheetHeader title="New branch" intro="Fees and hours can be set on the next screen. Staff are assigned on the Staff page." onClose={() => close()} />
          <form
            className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto px-5 pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!ready) return;
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
            }}
          >
            <Field label="Name">
              <TextInput value={name} onChange={setName} maxLength={60} placeholder="Lazimpat" autoFocus />
            </Field>
            <Field label="Address">
              <TextInput value={address} onChange={setAddress} maxLength={200} placeholder="Lazimpat Road, Kathmandu" />
            </Field>
            <Field label="Phone" hint="Optional.">
              <TextInput value={phone} onChange={setPhone} maxLength={30} placeholder="01-4000000" />
            </Field>
            {branches.length > 0 && (
              <Field label="Menu" hint="Every branch has its own menu. A copy is a starting point — after that the two are independent.">
                <Select
                  value={copyFrom}
                  onChange={setCopyFrom}
                  options={[{ value: '', label: 'Start with an empty menu' }, ...branches.map((b) => ({ value: b.id, label: `Copy from ${b.name}` }))]}
                />
              </Field>
            )}
            <div className={SHEET_FOOT}>
              <button type="submit" disabled={busy || !ready} className={FOOT_PRIMARY}>
                {pending === 'new' ? 'Adding…' : 'Add branch'}
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
