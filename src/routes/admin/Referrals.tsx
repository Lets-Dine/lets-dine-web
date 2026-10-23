import { useState } from 'react';
import { fetchReferrals } from '../../api/staff';
import type { Referral } from '../../api/staff';
import { ADMIN_GHOST, Empty, Loading, Panel } from '../../components/admin/kit';
import { Block, Step } from '../../components/admin/profile';
import { DISPLAY, cx } from '../../components/ui';
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
    <div className="mx-auto max-w-6xl">
      <h1 className={cx(DISPLAY, 'animate-rise text-[clamp(40px,7vw,76px)] leading-[0.98] tracking-[-0.03em]')}>Referrals</h1>
      <p className="mt-5 max-w-[34ch] animate-rise text-[clamp(20px,2.6vw,28px)] font-medium leading-[1.3] text-ink-2 [animation-delay:120ms] sm:max-w-[40ch]">
        {referrals.length === 0
          ? 'No one has joined with your link yet. When a restaurant you invite pays for a plan, one month is added to yours.'
          : `${referrals.length} ${referrals.length === 1 ? 'restaurant has' : 'restaurants have'} joined with your link, and ${rewarded} ${rewarded === 1 ? 'month has' : 'months have'} been added to yours.`}
      </p>

      <section aria-label="The three answers" className="mt-10 animate-rise overflow-hidden rounded-[28px] bg-surface-2 ring-1 ring-hairline-strong ring-inset [animation-delay:200ms]">
        <div className="grid divide-y divide-hairline md:grid-cols-3 md:divide-x md:divide-y-0">
          <Cell title="Joined" sub="Restaurants using your link">{referrals.length}</Cell>
          <Cell title="Months added" sub="One per paying restaurant" good>{rewarded}</Cell>
          <Cell title="Waiting" sub="Yet to make a first payment">{referrals.length - rewarded}</Cell>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Block title="Restaurants you invited" hint="Newest first" delay={260}>
          <ReferralList referrals={referrals} />
        </Block>
        <div className="grid content-start gap-6">
          <InviteLink code={code} />
        </div>
      </div>
    </div>
  );
}

function Cell({ title, sub, good, children }: { title: string; sub: string; good?: boolean; children: number }) {
  return (
    <div className="px-6 py-6">
      <h2 className="mb-3 text-[13px] font-semibold text-ink-3">{title}</h2>
      <p className={cx(DISPLAY, 'text-[clamp(28px,3.4vw,38px)] leading-none tnum', good && 'text-mint-ink')}>{children}</p>
      <p className="mt-2 text-[13.5px] text-ink-3">{sub}</p>
    </div>
  );
}

function InviteLink({ code }: { code: string }) {
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
    <Block
      title="Your invite link"
      delay={300}
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
    </Block>
  );
}

function ReferralList({ referrals }: { referrals: Referral[] }) {
  if (referrals.length === 0) return <p className="text-[14px] text-ink-3">No one has joined with your link yet.</p>;
  return (
    <ul className="border-t border-hairline">
      {referrals.map((row, i) => (
        <Step
          key={row.id}
          label={row.name}
          note={row.rewardedAt ? `Paid. One month added ${formatDay(row.rewardedAt)}.` : 'Waiting for their first payment.'}
          value={`Joined ${formatDay(row.joinedAt)}`}
          delay={300 + Math.min(i, 12) * 45}
        />
      ))}
    </ul>
  );
}
