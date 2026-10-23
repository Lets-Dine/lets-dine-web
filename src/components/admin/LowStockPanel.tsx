import { Link } from 'react-router-dom';
import { INVENTORY_ENABLED, fetchIngredients, formatQty, isLow } from '../../api/inventory';
import { useAuth } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { Panel, Row } from './kit';

/** Dashboard card: ingredients at or below their warning line. Renders nothing when stock is fine or unreadable. */
/** `plain` drops the box for the redesigned dashboard: a hairline, a heading, and rows. */
export function LowStockPanel({ plain = false }: { plain?: boolean }) {
  const { allows } = useAuth();
  return INVENTORY_ENABLED && allows('inventory:view') ? <LowStock plain={plain} /> : null;
}

function LowStock({ plain }: { plain: boolean }) {
  const list = useAsync(fetchIngredients, []);
  const low = (list.data ?? []).filter(isLow);
  if (low.length === 0) return null;

  if (plain)
    return (
      <section className="mb-14 animate-rise">
        <div className="mb-5 flex items-baseline justify-between gap-3 border-t border-hairline pt-8">
          <h2 className="font-display text-[24px] font-bold leading-[1.1] tracking-tight">Running low</h2>
          <Link to="/admin/inventory" className="text-[13.5px] font-semibold text-flame-1 transition-opacity hover:opacity-80">
            Open stock →
          </Link>
        </div>
        <p className="mb-4 text-[13.5px] text-ink-3">
          {low.length} ingredient{low.length === 1 ? '' : 's'} below the warning line.
        </p>
        <ul className="divide-y divide-hairline">
          {low.slice(0, 6).map((ing) => (
            <li key={ing.id} className="flex items-center gap-3 py-3">
              <span aria-hidden className={`size-2 shrink-0 rounded-full ${ing.quantity <= 0 ? 'bg-berry' : 'bg-gold'}`} />
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{ing.name}</span>
              <span className="shrink-0 text-[14.5px] font-bold text-berry tnum">{ing.quantity <= 0 ? 'Out' : formatQty(ing.quantity, ing.unit)}</span>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <Panel
      title="Running low"
      hint={`${low.length} ingredient${low.length === 1 ? '' : 's'} below the warning line`}
      bare
      className="mb-4 animate-rise [animation-delay:240ms]"
      action={
        <Link to="/admin/inventory" className="text-[12.5px] font-semibold text-flame-1">
          Open stock
        </Link>
      }
    >
      {low.slice(0, 6).map((ing, n) => (
        <Row key={ing.id} className="animate-rise" style={{ animationDelay: `${300 + n * 45}ms` }}>
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{ing.name}</span>
          <span className="shrink-0 text-[14px] font-bold text-berry tnum">
            {ing.quantity <= 0 ? 'Out' : formatQty(ing.quantity, ing.unit)}
          </span>
        </Row>
      ))}
    </Panel>
  );
}
