import { PageTitle } from '../../components/admin/kit';
import { DeliveriesSection } from './DeliveryQuality';
import { DishProfitSection } from './DishMargins';

/**
 * The two checks that look back at what already happened, kept together on one page: dishes whose
 * profit has been squeezed by ingredient prices, and deliveries that ended up in poorly rated dishes.
 * Neither is a daily job — the Stock page points here only when something is actually off.
 */
export function Watchlist() {
  return (
    <>
      <PageTitle
        title="Watchlist"
        purpose="What needs your attention."
        subtitle="Dishes that earn too little after ingredient prices, and deliveries that disappointed diners. Check weekly; it only needs action when something is flagged."
      />
      <div className="grid gap-10">
        <DishProfitSection />
        <DeliveriesSection />
      </div>
    </>
  );
}
