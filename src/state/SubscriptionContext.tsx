import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { SUBSCRIPTION_ENABLED, fetchInvoices, fetchSubscription, fetchUsage, isSuspension } from '../api/staff';
import { deriveNotice, isLockedOut } from '../domain/subscription';
import type { Invoice, Notice, Subscription, Usage } from '../domain/subscription';
import { useAuth } from './AuthContext';

/**
 * Where the restaurant stands with its plan, read once when the dashboard opens
 * and kept fresh. Three things lean on it — the sidebar chip, the alert banner and
 * the Plan page — and none of them should each go and ask.
 *
 * It also decides *locked*: a suspended or cancelled restaurant is closed to its
 * staff. An owner can still read their own plan (that is how they pay); anyone
 * else is refused by the API itself, so for them "locked" is learned from that
 * refusal rather than from data.
 */

/** A plan changes by the day, not the minute — and a lock should not take a whole shift to be noticed. */
const REFRESH_MS = 5 * 60 * 1000;

const DISMISSED_KEY = 'letsDine.notice.dismissed.v1';

type Phase = 'loading' | 'ready' | 'error';

interface SubscriptionValue {
  /** False on the offline demo and for roles that cannot see a plan — nothing below is ever filled in. */
  enabled: boolean;
  phase: Phase;
  subscription: Subscription | null;
  usage: Usage | null;
  /** Owners only. */
  invoices: Invoice[] | null;
  /** Closed to staff: suspended, cancelled, or refused as such by the API. */
  locked: boolean;
  /** The one thing worth a banner right now, unless it was dismissed. */
  notice: Notice | null;
  error: string | null;
  dismissNotice: () => void;
  /** Re-reads everything; resolves once it has. */
  reload: () => Promise<void>;
  /** Called by anything that was refused with SUBSCRIPTION_SUSPENDED. */
  markLocked: () => void;
}

const SubscriptionContext = createContext<SubscriptionValue | null>(null);

function readDismissed(): string[] {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { allows } = useAuth();
  const canView = SUBSCRIPTION_ENABLED && allows('billing:view');
  const canManage = canView && allows('billing:manage');

  const [phase, setPhase] = useState<Phase>(canView ? 'loading' : 'ready');
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [refused, setRefused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!canView) return;

    // The subscription is the one that matters; usage and invoices are worth having but never worth failing over.
    const [sub, use, inv] = await Promise.allSettled([fetchSubscription(), fetchUsage(), canManage ? fetchInvoices() : Promise.resolve(null)]);
    if (!alive.current) return;

    if (sub.status === 'rejected') {
      if (isSuspension(sub.reason)) {
        setRefused(true);
        setPhase('ready');
      } else {
        setError(sub.reason instanceof Error ? sub.reason.message : 'The plan could not be read.');
        setPhase('error');
      }
      return;
    }

    setSubscription(sub.value);
    setUsage(use.status === 'fulfilled' ? use.value : null);
    setInvoices(inv.status === 'fulfilled' ? inv.value : null);
    setRefused(false);
    setError(null);
    setPhase('ready');
  }, [canView, canManage]);

  useEffect(() => {
    void reload();
    if (!canView) return;

    const timer = setInterval(() => void reload(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload, canView]);

  const markLocked = useCallback(() => setRefused(true), []);

  const locked = refused || (subscription !== null && isLockedOut(subscription.status));

  const candidate = useMemo(
    () => (subscription ? deriveNotice({ subscription, usage, invoices, canManage, now: new Date() }) : null),
    [subscription, usage, invoices, canManage],
  );
  const notice = candidate && !(candidate.dismissible && dismissed.includes(candidate.id)) ? candidate : null;

  const dismissNotice = useCallback(() => {
    if (!candidate) return;
    setDismissed((prev) => {
      const next = [...prev, candidate.id];
      try {
        sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
      } catch {
        /* dismissed for this view only */
      }
      return next;
    });
  }, [candidate]);

  const value = useMemo<SubscriptionValue>(
    () => ({ enabled: canView, phase, subscription, usage, invoices, locked, notice, error, dismissNotice, reload, markLocked }),
    [canView, phase, subscription, usage, invoices, locked, notice, error, dismissNotice, reload, markLocked],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription(): SubscriptionValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used inside SubscriptionProvider');
  return ctx;
}
