/**
 * A manager vouching for a discount, or for a bill that is not what was ordered, at the till of somebody who may not do
 * either alone. Nothing here is stored: the PIN lives in memory for the length of one retried payment and is then dropped.
 */
export interface ApprovalGrant {
  memberId: string;
  pin: string;
}

/** The server's error keys for this, which the command runner answers by asking a manager rather than showing a toast. */
export const APPROVAL_REQUIRED = 'PAYMENT_APPROVAL_REQUIRED';
export const APPROVAL_INVALID = 'PAYMENT_APPROVAL_INVALID';

/** What the server says it is being asked to approve, so the manager does not sign blind. */
export interface ApprovalDetails {
  /** Minor units. */
  discount?: number;
  currency?: string;
  /** How many items were ordered, and how many the bill charges. */
  ordered?: number;
  charged?: number;
}

export interface ApprovalAsk {
  /** What needs approving, as the server named it: `discount`, `lines`, `customer`. */
  reasons: string[];
  details?: ApprovalDetails;
  /** Why the last try failed, shown when asking again. */
  note?: string;
}

let current: ApprovalGrant | null = null;
/**
 * Taken by the payment call itself, so no screen has to carry an approval through to it. Taking it empties the slot, so the
 * PIN goes with that one request and cannot ride along on any other payment that starts while it is in flight.
 */
export const takeApproval = (): ApprovalGrant | null => {
  const grant = current;
  current = null;
  return grant;
};
export const setApproval = (grant: ApprovalGrant | null) => {
  current = grant;
};

type Asker = (ask: ApprovalAsk) => Promise<ApprovalGrant | null>;
let asker: Asker | null = null;

/** The dialog registers here when it is mounted. */
export function registerApprovalAsker(next: Asker): () => void {
  asker = next;
  return () => {
    if (asker === next) asker = null;
  };
}

/** Resolves to a manager's id and PIN, or null if nobody is there to ask or the person at the till gave up. */
export const askForApproval = (ask: ApprovalAsk): Promise<ApprovalGrant | null> => (asker ? asker(ask) : Promise.resolve(null));
