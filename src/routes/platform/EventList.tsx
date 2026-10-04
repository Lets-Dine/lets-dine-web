import { Link } from 'react-router-dom';
import type { AuditEvent, EventKind } from '../../api/platformConsole';
import { dayLabel, groupByDay } from '../../components/admin/kit';
import { cx } from '../../components/ui';
import { clock } from './kit';

export const KIND_LABEL: Record<EventKind, string> = {
  billing: 'Billing',
  access: 'Support access',
  restaurant: 'Restaurant',
  security: 'Security',
  plan: 'Plan',
};

const KIND_DOT: Record<EventKind, string> = {
  billing: 'bg-mint',
  access: 'bg-pass',
  restaurant: 'bg-flame-2',
  security: 'bg-berry',
  plan: 'bg-gold',
};

/** Who did what, grouped by day. Every operator action ends up here, so nothing an operator does is invisible. */
export function EventList({ events, showTenant = true }: { events: AuditEvent[]; showTenant?: boolean }) {
  return (
    <div>
      {groupByDay(events, (e) => e.at).map((day) => (
        <section key={day[0].at.slice(0, 10) + day[0].id}>
          <h3 className="sticky top-0 z-10 border-b border-hairline bg-docket-surface/95 px-4 py-2 text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink-4 backdrop-blur-sm sm:px-5">{dayLabel(day[0].at)}</h3>
          <ul>
            {day.map((e) => (
              <li key={e.id} className="flex items-start gap-3 border-b border-hairline px-4 py-3 last:border-0 sm:px-5">
                <span className="w-11 shrink-0 pt-0.5 text-[12px] text-ink-4 tnum">{clock(e.at)}</span>
                <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', KIND_DOT[e.kind])} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px]">
                    <span className="font-semibold">{e.action}</span>
                    {showTenant && e.tenantId && e.tenantName && (
                      <>
                        {' · '}
                        <Link to={`/platform/restaurants/${e.tenantId}`} className="text-ink-2 hover:underline">
                          {e.tenantName}
                        </Link>
                      </>
                    )}
                  </span>
                  {e.detail && <span className="mt-0.5 block text-[12.5px] text-ink-3">{e.detail}</span>}
                </span>
                <span className="hidden shrink-0 text-right text-[12px] text-ink-4 sm:block">
                  {KIND_LABEL[e.kind]}
                  <span className="block">{e.actor}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
