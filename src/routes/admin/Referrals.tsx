import { useState } from 'react';
import { fetchReferrals } from '../../api/staff';
import type { Referral } from '../../api/staff';
import { ADMIN_GHOST, Empty, Loading, PageTitle, Panel } from '../../components/admin/kit';
import { formatDay } from '../../domain/subscription';
import { useAsync } from '../../state/useAsync';

/**
 * The owner's invitations. Sharing the link is how a restaurant gets referred;
 * the list is what happened after they joined, including the month their first
 * payment added here.
 */
export function Referrals() {
  const state = useAsync(() => fetchReferrals(), []);

  if (!state.data) {
    if (state.loading) return <Loading label="Reading your referrals…" />;
    return (
      <Panel>
        <Empty
          title="Referrals could not be read"
          message={state.error?.message ?? 'Something went wrong reading your referrals. Nothing has changed.'}
          action={
            <button type="button" className={ADMIN_GHOST} onClick={() => state.reload()}>
              Try again
            </button>
          }
        />
      </Panel>
    );
  }

  const { code, referrals } = state.data;
  const rewarded = referrals.filter((row) => row.rewardedAt).length;

  return (
    <>
      <PageTitle title="Referrals" subtitle="Invite a restaurant. When they pay for a plan, one month is added to yours." />
      <div className="grid gap-4">
        <InviteLink code={code} invited={referrals.length} rewarded={rewarded} />
        <ReferralList referrals={referrals} />
      </div>
    </>
  );
}

function InviteLink({ code, invited, rewarded }: { code: string; invited: number; rewarded: number }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/get-started?ref=${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Panel
      title="Your invite link"
      action={
        <button type="button" className={ADMIN_GHOST} onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      }
    >
      <p className="break-all text-[14px] font-medium text-ink">{link}</p>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">
        Anyone who opens this and creates a restaurant is referred by you. The extra month arrives with their first payment, and only once.
      </p>
      <dl className="mt-4 flex gap-8 border-t border-hairline pt-4">
        <Count label="Joined" value={String(invited)} />
        <Count label="Months added" value={String(rewarded)} />
      </dl>
    </Panel>
  );
}

function Count({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] font-semibold uppercase tracking-[0.09em] text-ink-4">{label}</dt>
      <dd className="mt-0.5 text-[22px] font-semibold tnum">{value}</dd>
    </div>
  );
}

function ReferralList({ referrals }: { referrals: Referral[] }) {
  return (
    <Panel title="Restaurants you invited" bare>
      {referrals.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13.5px] text-ink-3">No one has joined with your link yet.</p>
      ) : (
        referrals.map((row) => (
          <div key={row.id} className="border-b border-hairline px-4 py-4 last:border-0 sm:px-5">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 truncate text-[14px] font-semibold">{row.name}</div>
              <div className="shrink-0 text-[12.5px] text-ink-4 tnum">Joined {formatDay(row.joinedAt)}</div>
            </div>
            <p className="mt-1 text-[13px] text-ink-3">
              {row.rewardedAt ? `Paid. One month added ${formatDay(row.rewardedAt)}.` : 'Waiting for their first payment.'}
            </p>
          </div>
        ))
      )}
    </Panel>
  );
}
