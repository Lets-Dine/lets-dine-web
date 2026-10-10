import { Link } from 'react-router-dom';
import { INVENTORY_ENABLED, fetchIngredients, formatQty, isLow } from '../../api/inventory';
import { useAuth } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { Panel, Row } from './kit';

/** Dashboard card: ingredients at or below their warning line. Renders nothing when stock is fine or unreadable. */
export function LowStockPanel() {
  const { allows } = useAuth();
  return INVENTORY_ENABLED && allows('inventory:view') ? <LowStock /> : null;
}

function LowStock() {
  const list = useAsync(fetchIngredients, []);
  const low = (list.data ?? []).filter(isLow);
  if (low.length === 0) return null;

  return (
    <Panel
      title="Running low"
      hint={`${low.length} ingredient${low.length === 1 ? '' : 's'} below the warning line`}
      bare
      className="mb-4"
      action={
        <Link to="/admin/inventory" className="text-[12.5px] font-semibold text-flame-1">
          Open stock
        </Link>
      }
    >
      {low.slice(0, 6).map((ing) => (
        <Row key={ing.id}>
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{ing.name}</span>
          <span className="shrink-0 text-[14px] font-bold text-berry tnum">
            {ing.quantity <= 0 ? 'Out' : formatQty(ing.quantity, ing.unit)}
          </span>
        </Row>
      ))}
    </Panel>
  );
}
