import { useEffect, useState } from 'react';

/**
 * A clock the render can read. Ages on the pass ("7m on the grill") are the
 * whole point of the screen, so they cannot wait for the next queue poll to
 * become true — this re-renders on its own cadence, independent of data.
 *
 * Every caller on a screen shares one interval per distinct period, which is
 * cheap enough: a tick is a state set, not a fetch.
 */
export function useNow(periodMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), periodMs);
    return () => clearInterval(timer);
  }, [periodMs]);

  return now;
}
