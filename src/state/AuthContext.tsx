import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BRANCHES_ENABLED, fetchBranchAccess, signIn as apiSignIn, signOut as apiSignOut, switchBranch as apiSwitchBranch } from '../api/staff';
import { AUTH_EXPIRED_EVENT } from '../api/http';
import { can } from '../domain/permissions';
import type { Permission } from '../domain/permissions';
import type { StaffMember } from '../domain/types';
import { useToast } from './ToastContext';

/**
 * Who is at the terminal. A demo stand-in for §23: the real thing is a signed
 * server session, and the shape here — a member with a role, restored across
 * reloads — is what that session would hand back.
 *
 * Nothing security-carrying lives on the client. `can()` here decides what to
 * *render*; `api/admin.ts` decides what actually happens.
 */

const KEY = 'letsDine.staff.v1';

interface AuthValue {
  staff: StaffMember | null;
  signIn: (email: string, pin: string) => Promise<StaffMember>;
  signOut: () => void;
  /** Moves this session to another branch the member may work in. Resolves once the new token is stored and `staff` reflects it. */
  switchBranch: (branchId: string) => Promise<void>;
  /** Re-reads the branches this person may work in. Call after anything that adds, renames or disables one. */
  refreshBranches: () => Promise<void>;
  allows: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

function restore(): StaffMember | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StaffMember) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffMember | null>(restore);
  const toast = useToast();
  const staffRef = useRef(staff);
  staffRef.current = staff;

  const signIn = useCallback(async (email: string, pin: string) => {
    const member = await apiSignIn(email, pin);
    try {
      localStorage.setItem(KEY, JSON.stringify(member));
    } catch {
      /* a private-mode browser still gets to work this shift */
    }
    setStaff(member);
    return member;
  }, []);

  const persist = useCallback((member: StaffMember) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(member));
    } catch {
      /* a private-mode browser still gets to work this shift */
    }
  }, []);

  const switchBranch = useCallback(
    async (branchId: string) => {
      const current = staffRef.current;
      if (!current || current.branchId === branchId) return;
      // The API call replaces the stored token; only then does the member object (and everything keyed on it) move.
      const next = await apiSwitchBranch(branchId);
      const member: StaffMember = { ...current, branchId: next.branchId, branches: next.branches };
      persist(member);
      setStaff(member);
    },
    [persist],
  );

  const refreshBranches = useCallback(async () => {
    const current = staffRef.current;
    if (!BRANCHES_ENABLED || !current) return;
    try {
      const fresh = await fetchBranchAccess();
      const known = current.branches ?? [];
      const same = known.length === fresh.branches.length && known.every((b, i) => b.id === fresh.branches[i].id && b.name === fresh.branches[i].name);
      if (same) return;
      // Only the list changes; the branch being worked in stays put unless it is no longer reachable.
      const stillHere = fresh.branches.some((b) => b.id === current.branchId);
      const member: StaffMember = { ...current, branches: fresh.branches, branchId: stillHere ? current.branchId : fresh.branchId };
      persist(member);
      setStaff(member);
    } catch {
      /* the switcher just keeps the list it had; a real auth failure is handled by the 401 listener */
    }
  }, [persist]);

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    apiSignOut();
    setStaff(null);
  }, []);

  /**
   * The backend rejected the stored token as expired. Only relevant if a
   * member was actually signed in — the same 401 fires for a platform-key
   * request too, and `PlatformLayout` handles that half on its own.
   */
  useEffect(() => {
    function onExpired() {
      if (!staffRef.current) return;
      signOut();
      toast('Your session has ended. Please sign in again.', '🔒');
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [signOut, toast]);

  const value = useMemo<AuthValue>(
    () => ({
      staff,
      signIn,
      signOut,
      switchBranch,
      refreshBranches,
      allows: (permission) => (staff ? can(staff.role, permission) : false),
    }),
    [staff, signIn, signOut, switchBranch, refreshBranches],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Inside the dashboard the member is guaranteed — the layout redirects first. */
export function useStaff(): StaffMember {
  const { staff } = useAuth();
  if (!staff) throw new Error('useStaff must be used inside a signed-in dashboard route');
  return staff;
}
