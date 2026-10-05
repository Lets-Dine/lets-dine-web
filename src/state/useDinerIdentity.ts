import { useCallback, useState } from 'react';

/** Enough to upsert a `Customer` by phone — name is for the kitchen, phone is the identity. */
export interface DinerIdentity {
  name: string;
  phone: string;
}

const STORAGE_KEY = 'FeastoX.diner-identity';

function readStoredIdentity(): DinerIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DinerIdentity>;
    if (!parsed.name || !parsed.phone) return null;
    return { name: parsed.name, phone: parsed.phone };
  } catch {
    return null;
  }
}

function writeStoredIdentity(identity: DinerIdentity): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    /* storage full or blocked — this device just won't remember it next time */
  }
}

/**
 * A diner's own name + phone, remembered on this device across every dine-in
 * order (table or floor) regardless of restaurant or visit — captured once
 * at checkout (§16b) and reused as the default afterwards, with an explicit
 * way to change it.
 */
export function useDinerIdentity(): [DinerIdentity | null, (identity: DinerIdentity) => void] {
  const [identity, setIdentityState] = useState<DinerIdentity | null>(readStoredIdentity);

  const setIdentity = useCallback((next: DinerIdentity) => {
    writeStoredIdentity(next);
    setIdentityState(next);
  }, []);

  return [identity, setIdentity];
}
