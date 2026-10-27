import { useSyncExternalStore } from 'react';

/**
 * What THIS computer is doing about printing. Printers themselves live on the server (they belong to the
 * branch); what is local is whether this PC is the one that sends slips to them, and how its attempts are going.
 */

export interface JobProblem {
  id: string;
  /** "KOT #12 → Bar printer", for the failure banner. */
  label: string;
  error: string;
  /** Don't retry on its own before this moment; a manual Retry clears it. */
  retryAt: number;
}

interface State {
  /** This PC prints the branch's slips (needs QZ Tray running). */
  agentOn: boolean;
  failed: JobProblem[];
}

const KEY = 'FeastoX.print.agent.v1';

function loadAgent(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

let state: State = { agentOn: loadAgent(), failed: [] };
const listeners = new Set<() => void>();

function commit(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getState = () => state;
export const useStore = () => useSyncExternalStore(subscribe, getState);

export function setAgentOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* private mode: works this session, just not past a reload */
  }
  commit({ ...state, agentOn: on });
}

export function recordFailure(problem: JobProblem) {
  commit({ ...state, failed: [...state.failed.filter((p) => p.id !== problem.id), problem] });
}

export function clearFailure(id: string) {
  if (state.failed.some((p) => p.id === id)) commit({ ...state, failed: state.failed.filter((p) => p.id !== id) });
}

/** Failures for jobs that are no longer waiting (printed elsewhere, printer removed or off, aged out) have nothing to retry. */
export function pruneFailures(stillPending: Set<string>) {
  if (state.failed.some((p) => !stillPending.has(p.id))) commit({ ...state, failed: state.failed.filter((p) => stillPending.has(p.id)) });
}

/** Let every failed job try again now. */
export function retryAll() {
  commit({ ...state, failed: state.failed.map((p) => ({ ...p, retryAt: 0 })) });
}
