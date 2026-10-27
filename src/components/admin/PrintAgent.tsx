import { useEffect } from 'react';
import { IS_LIVE_API } from '../../api/http';
import { subscribeToTicketChanges } from '../../api/kitchen';
import { claimJob, listPendingJobs, markJobFailed, markJobPrinted } from '../../api/printers';
import type { PrintJob } from '../../api/printers';
import { buildJobSlip } from '../../printing/escpos';
import type { Paper } from '../../printing/escpos';
import { connect, printRaw } from '../../printing/qz';
import { clearFailure, getState, pruneFailures, recordFailure, retryAll, subscribe, useStore } from '../../printing/store';
import { useAuth } from '../../state/AuthContext';
import { Alert } from '../icons';
import { ADMIN_GHOST } from './kit';

/** After a failed slip, wait this long before trying the same job again on its own. */
const RETRY_AFTER_MS = 30_000;
const POLL_MS = 30_000;

const SLIP_LABEL = { KITCHEN: 'KOT', BAR: 'BOT' } as const;
const PAPER: Record<PrintJob['printer']['paperWidth'], Paper> = { MM80: '80mm', MM58: '58mm' };

const labelOf = (job: PrintJob) => `${job.tickets.map((t) => `${SLIP_LABEL[t.station]} #${t.number}`).join(' + ')} → ${job.printer.name}`;

const CLAIMANT = crypto.randomUUID();
const LOAD_TIMEOUT_MS = 15_000;
const PRINT_TIMEOUT_MS = 30_000;

/** A request or a printer that never answers must fail, not freeze every slip behind it. */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Slips that came out on this PC but couldn't be reported — never printed again, only re-reported. */
const printedLocally = new Set<string>();

async function report(id: string): Promise<void> {
  const ok = await markJobPrinted(id).then(() => true, () => markJobPrinted(id).then(() => true, () => false));
  if (ok) printedLocally.delete(id);
}

/** One printer's queue, oldest first. It stops at the first problem so a later slip never comes out ahead of an earlier one. */
async function runPrinter(jobs: PrintJob[]): Promise<void> {
  for (const job of jobs) {
    if (!getState().agentOn) return;
    if (printedLocally.has(job.id)) {
      await report(job.id);
      continue;
    }
    const held = getState().failed.find((p) => p.id === job.id);
    if (held && held.retryAt > Date.now()) return;
    if (!job.tickets.length) continue;
    const claimed = await withTimeout(claimJob(job.id, CLAIMANT), LOAD_TIMEOUT_MS, 'Claiming the slip')
      .then((r) => r.claimed)
      .catch(() => false);
    if (!claimed) continue;
    try {
      await withTimeout(
        printRaw({ host: job.printer.ipAddress, port: job.printer.port }, buildJobSlip(job.tickets, PAPER[job.printer.paperWidth])),
        PRINT_TIMEOUT_MS,
        'The printer',
      );
    } catch (e) {
      const error = (e instanceof Error && e.message) || 'Print failed';
      recordFailure({ id: job.id, label: labelOf(job), error, retryAt: Date.now() + RETRY_AFTER_MS });
      await markJobFailed(job.id, CLAIMANT, error).catch(() => {});
      return;
    }
    clearFailure(job.id);
    printedLocally.add(job.id);
    await report(job.id);
  }
}

/**
 * The server holds the queue (a job per printer per change) and lets only one session claim each, so a second PC
 * left on never double-prints. Printers run side by side — a dead bar printer must not hold up the kitchen's —
 * but each printer's slips go out one at a time, in order.
 */
async function pump(): Promise<void> {
  if (!getState().agentOn) return;
  if (working) {
    again = true; // something arrived mid-run: look once more when this pass ends
    return;
  }
  working = true;
  try {
    do {
      again = false;
      if (!getState().agentOn) break;
      const jobs = await withTimeout(listPendingJobs(), LOAD_TIMEOUT_MS, 'Loading print jobs').catch(() => null);
      if (!jobs) break;
      pruneFailures(new Set(jobs.map((j) => j.id)));
      const byPrinter = new Map<string, PrintJob[]>();
      for (const job of jobs) byPrinter.set(job.printer.id, [...(byPrinter.get(job.printer.id) ?? []), job]);
      await Promise.all([...byPrinter.values()].map(runPrinter));
    } while (again);
  } finally {
    working = false;
  }
}

let working = false;
let again = false;

/**
 * Prints the branch's kitchen and bar slips from whichever admin page is open on a PC that has "Use this PC to
 * print" switched on (Settings → Printing). Renders nothing unless a slip failed — a silent printer is how orders
 * get missed, so a failure stays on screen until it prints.
 *
 * Slips still waiting when this connects print too, so a dropped connection or a restart loses nothing.
 */
export function PrintAgent() {
  const { staff, allows } = useAuth();
  const { agentOn, failed } = useStore();
  const allowed = Boolean(staff) && allows('orders:advance') && IS_LIVE_API;
  const running = allowed && agentOn;

  useEffect(() => {
    if (!running) return;
    // Connect up front so QZ's "allow this site" prompt appears now, not in the middle of the first order.
    connect().catch(() => {});
    void pump();
    // A ticket event means jobs were just queued; the socket's (re)join and a slow poll cover anything missed.
    const leave = subscribeToTicketChanges(() => void pump());
    const unsubscribe = subscribe(() => void pump());
    const poll = setInterval(() => void pump(), POLL_MS);
    return () => {
      leave();
      unsubscribe();
      clearInterval(poll);
    };
  }, [running]);

  if (!running || failed.length === 0) return null;

  return (
    <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl bg-berry/10 px-4 py-3 ring-1 ring-berry/30 ring-inset">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-berry text-white" aria-hidden>
        <Alert size={16} />
      </span>
      <div className="min-w-0 flex-1 text-[14px] leading-snug">
        <p className="font-semibold text-ink">{failed.length === 1 ? "A slip didn't print" : `${failed.length} slips didn't print`}</p>
        <p className="text-ink-3">
          {failed.map((p) => p.label).join(' · ')} — check the printer is on and reachable, and that QZ Tray is running.
        </p>
        <p className="text-[12.5px] text-ink-4">{failed[0].error}</p>
      </div>
      <button type="button" className={ADMIN_GHOST} onClick={retryAll}>
        Retry
      </button>
    </div>
  );
}
