/**
 * Who the invoice is made out to, entered at the till for the bill about to be settled. Like the manager's approval, it is
 * carried here so the dozen screens that open the payment sheet need not pass it through to the payment call.
 * The payment sheet clears it as soon as the settle call finishes, so one buyer never rides along on the next bill; it is
 * read without emptying because a manager's approval re-runs the same call and the buyer must survive that retry.
 */
export interface Buyer {
  buyerName: string;
  buyerPan?: string;
}

let current: Buyer | null = null;
export const setBuyer = (buyer: Buyer | null) => {
  current = buyer;
};
export const currentBuyer = (): Buyer | null => current;
