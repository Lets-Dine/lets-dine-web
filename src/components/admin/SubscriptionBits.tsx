import { Link, NavLink } from 'react-router-dom';
import { chipStatus, needsAttention } from '../../domain/subscription';
import type { Notice, Subscription, SubscriptionStatus, Tone } from '../../domain/subscription';
import { STATUS_LABEL, STATUS_TONE } from '../../domain/subscription';
import { Alert, Info, Lock, X } from '../icons';
import { DISPLAY, cx } from '../ui';
import { ADMIN_GHOST, ADMIN_QUIET } from './kit';

/**
 * The few places the plan shows up outside its own page. They share one tone
 * vocabulary — good, info, warn, bad — so "overdue" is the same colour in the
 * sidebar, in the banner and on the Plan page.
 */

const PILL: Record<Tone, string> = {
  good: 'bg-mint/14 text-mint-ink ring-mint/30',
  info: 'bg-flame-2/12 text-flame-1 ring-flame-2/30',
  warn: 'bg-gold/14 text-gold-ink ring-gold/35',
  bad: 'bg-berry/12 text-berry-ink ring-berry/30',
  muted: 'bg-surface-2 text-ink-3 ring-hairline',
};

/** Words in the status's own colour, for text that sits on a plain surface. */
const TONE_TEXT: Record<Tone, string> = {
  good: 'text-mint-ink',
  info: 'text-flame-1',
  warn: 'text-gold-ink',
  bad: 'text-berry-ink',
  muted: 'text-ink-3',
};

export function TonePill({ tone, children, className }: { tone: Tone; children: string; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold ring-1 ring-inset',
        PILL[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

export function SubscriptionStatusPill({ status }: { status: SubscriptionStatus }) {
  return <TonePill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</TonePill>;
}

/**
 * The plan in the sidebar, under the restaurant's name — where everyone, a
 * manager included, sees it without going looking. Quiet while all is well; the
 * status takes the colour of the trouble when there is some.
 */
export function PlanChip({ subscription, notice, className }: { subscription: Subscription; notice: Notice | null; className?: string }) {
  const tone = STATUS_TONE[subscription.status];
  return (
    <NavLink
      to="/admin/plan"
      className={({ isActive }) =>
        cx(
          'block rounded-xl px-3 py-2 ring-1 ring-inset transition-colors duration-150',
          isActive ? 'bg-surface-2 ring-hairline-strong' : 'ring-hairline hover:bg-surface-2/60',
          className,
        )
      }
    >
      <span className="flex items-center gap-2">
        <span className="truncate text-[13px] font-semibold">{subscription.plan.name} plan</span>
        {needsAttention(notice) && <span className={cx('size-2 shrink-0 rounded-full', notice?.tone === 'bad' ? 'bg-berry' : 'bg-gold')} aria-label="Needs attention" />}
      </span>
      <span className={cx('mt-0.5 block truncate text-[12px]', tone === 'good' ? 'text-ink-4' : TONE_TEXT[tone])}>
        {chipStatus(subscription, new Date())}
      </span>
    </NavLink>
  );
}

const BANNER: Record<Notice['tone'], string> = {
  info: 'bg-surface-2/70 ring-hairline',
  warn: 'bg-gold/10 ring-gold/30',
  bad: 'bg-berry/10 ring-berry/30',
};

const BANNER_ICON: Record<Notice['tone'], string> = {
  info: 'text-ink-3',
  warn: 'text-gold-ink',
  bad: 'text-berry-ink',
};

/**
 * Shown above any dashboard page, but only when there is something to do about
 * the plan. It names the situation, says what still works, and offers the one
 * next step — to the Plan page, which is where the detail lives.
 */
export function SubscriptionBanner({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const Icon = notice.tone === 'info' ? Info : Alert;
  return (
    <div
      role={notice.tone === 'bad' ? 'alert' : 'status'}
      className={cx('mb-5 flex flex-wrap items-start gap-x-3 gap-y-3 rounded-2xl px-4 py-3.5 ring-1 ring-inset', BANNER[notice.tone])}
    >
      <Icon size={18} className={cx('mt-0.5 shrink-0', BANNER_ICON[notice.tone])} />
      <div className="min-w-0 flex-1 basis-60">
        <p className="text-[14px] font-semibold leading-snug">{notice.title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{notice.body}</p>
      </div>
      <div className="ml-[30px] flex shrink-0 items-center gap-1 sm:ml-0 sm:self-center">
        <Link to={notice.cta.to} className={cx(ADMIN_GHOST, 'h-9 px-3.5 text-[13px]')}>
          {notice.cta.label}
        </Link>
        {notice.dismissible && (
          <button type="button" onClick={onDismiss} aria-label="Dismiss" className={cx(ADMIN_QUIET, 'size-9 px-0')}>
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * What a member who is not the owner sees once the restaurant is suspended: the
 * API refuses them everything, so there is nothing to show but why, and who can
 * put it right. Said plainly, with a way to check again.
 */
export function LockedScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="mx-auto grid max-w-[440px] justify-items-center gap-3 py-16 text-center sm:py-24">
      <span className="grid size-12 place-items-center rounded-2xl bg-berry/12 text-berry-ink ring-1 ring-berry/30 ring-inset">
        <Lock size={22} />
      </span>
      <h1 className={cx(DISPLAY, 'mt-1 text-balance text-[26px] sm:text-[30px]')}>The dashboard is closed for now</h1>
      <p className="text-[14px] leading-relaxed text-ink-2">
        This restaurant's subscription is suspended, so the dashboard is closed to staff. The owner can restore access by settling the overdue
        invoice.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button type="button" className={ADMIN_GHOST} onClick={() => window.location.reload()}>
          Check again
        </button>
        <button type="button" className={ADMIN_QUIET} onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
