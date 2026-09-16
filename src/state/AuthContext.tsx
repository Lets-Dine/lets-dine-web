import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { signIn as apiSignIn, signOut as apiSignOut } from '../api/staff';
import { can } from '../domain/permissions';
import type { Permission } from '../domain/permissions';
import type { StaffMember } from '../domain/types';

/**
 * Who is at the terminal. A demo stand-in for §23: the real thing is a signed
 * server session, and the shape here — a member with a role, restored across
 * reloads — is what that session would hand back.
 *
 * Nothing security-carrying lives on the client. `can()` here decides what to
 * *render*; `api/admin.ts` decides what actually happens.
 */

const KEY = 'myfood.staff.v1';

interface AuthValue {
  staff: StaffMember | null;
  signIn: (email: string, pin: string) => Promise<StaffMember>;
  signOut: () => void;
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

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    apiSignOut();
    setStaff(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      staff,
      signIn,
      signOut,
      allows: (permission) => (staff ? can(staff.role, permission) : false),
    }),
    [staff, signIn, signOut],
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
