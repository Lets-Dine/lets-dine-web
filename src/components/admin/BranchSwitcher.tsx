import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRANCHES_ENABLED } from '../../api/staff';
import { ApiError } from '../../api/store';
import { useAuth } from '../../state/AuthContext';
import { useToast } from '../../state/ToastContext';
import { cx } from '../ui';

/**
 * Which branch this session is working in. A person at one branch just sees its name; anybody with
 * more than one gets a picker. Switching mints a new token server-side, so every screen below —
 * keyed on the branch in `AdminLayout` — reloads against the new scope rather than showing the old
 * branch's tables and tickets for a moment.
 */
export function BranchSwitcher({ className }: { className?: string }) {
  const { staff, switchBranch } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  const branches = staff?.branches ?? [];
  if (!BRANCHES_ENABLED || !staff || branches.length === 0) return null;

  const current = branches.find((branch) => branch.id === staff.branchId) ?? branches[0];

  if (branches.length === 1) {
    return <div className={cx('truncate text-[12px] font-semibold text-ink-3', className)}>{current.name}</div>;
  }

  async function onChange(branchId: string) {
    setPending(true);
    try {
      await switchBranch(branchId);
      // A table or floor id from the old branch means nothing in the new one.
      navigate('/admin');
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Could not switch branch. Try again.', '⚠️');
    } finally {
      setPending(false);
    }
  }

  return (
    <label className={cx('block', className)}>
      <span className="sr-only">Branch</span>
      <select
        value={current.id}
        disabled={pending}
        onChange={(e) => void onChange(e.target.value)}
        className="w-full cursor-pointer rounded-lg bg-surface-2/60 px-2.5 py-1.5 text-[13px] font-semibold text-ink ring-1 ring-hairline ring-inset disabled:opacity-60"
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id} className="bg-surface-2">
            {branch.name}
          </option>
        ))}
      </select>
    </label>
  );
}
